const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { uploadExpenseProof, deleteExpenseProof } = require('../lib/supabaseStorage');


// GET /api/expenses
const getExpenses = async (req, res, next) => {
  try {
    const { customerId, fromDate, toDate, minAmount, maxAmount, category, status } = req.query;
    const where = { tenantId: req.user.tenantId };

    if (req.user.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    if (customerId) where.customerId = customerId;
    if (category) where.category = category;
    if (status) where.status = status;
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = Number(minAmount);
      if (maxAmount !== undefined) where.amount.lte = Number(maxAmount);
    }
    if (fromDate || toDate) {
      where.spentAt = {};
      if (fromDate) where.spentAt.gte = new Date(fromDate);
      if (toDate) where.spentAt.lte = new Date(toDate);
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { spentAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: { expenses },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/expenses/:id
const getExpense = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    const expense = await prisma.expense.findFirst({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });
    if (!expense) return next(new AppError('Expense not found.', 404));

    res.status(200).json({ status: 'success', data: { expense } });
  } catch (err) {
    next(err);
  }
};

// POST /api/expenses
const createExpense = async (req, res, next) => {
  let uploadedProofPath = null;
  try {
    const {
      title,
      description,
      category,
      amount,
      currency,
      spentAt,
      customerId,
      proofUrl,
      proofPath,
      proofFileName,
      proofMimeType,
      proofFileBase64,
    } = req.body;

    if (!title) return next(new AppError('Expense title is required.', 400));
    if (amount === undefined || amount === null) {
      return next(new AppError('Expense amount is required.', 400));
    }
    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return next(new AppError('Expense amount must be a valid number greater than 0.', 400));
    }

    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!customer) return next(new AppError('Customer not found for this tenant.', 404));
    }

    let proofData = {
      proofUrl: proofUrl || null,
      proofPath: proofPath || null,
      proofFileName: proofFileName || null,
      proofMimeType: proofMimeType || null,
    };

    if (proofFileBase64) {
      const uploaded = await uploadExpenseProof({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        base64File: proofFileBase64,
        fileName: proofFileName,
        mimeType: proofMimeType,
      });
      proofData = {
        proofUrl: uploaded.proofUrl,
        proofPath: uploaded.proofPath,
        proofFileName: proofFileName || null,
        proofMimeType: proofMimeType || null,
      };
      uploadedProofPath = uploaded.proofPath;
    }

    const expense = await prisma.expense.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        customerId: customerId || null,
        title,
        description: description || null,
        category: category || null,
        amount: parsedAmount,
        currency: currency || undefined,
        spentAt: spentAt ? new Date(spentAt) : new Date(),
        proofUrl: proofData.proofUrl,
        proofPath: proofData.proofPath,
        proofFileName: proofData.proofFileName,
        proofMimeType: proofData.proofMimeType,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({ status: 'success', data: { expense } });
  } catch (err) {
    if (uploadedProofPath) {
      try {
        await deleteExpenseProof(uploadedProofPath);
      } catch (cleanupErr) {
        console.error(cleanupErr);
      }
    }
    next(err);
  }
};

// PATCH /api/expenses/:id
const updateExpense = async (req, res, next) => {
  let uploadedProofPath = null;
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    const existing = await prisma.expense.findFirst({ where });
    if (!existing) return next(new AppError('Expense not found.', 404));

    const {
      title,
      description,
      category,
      amount,
      currency,
      status,
      spentAt,
      customerId,
      proofUrl,
      proofPath,
      proofFileName,
      proofMimeType,
      proofFileBase64,
      removeProof,
    } = req.body;

    if (customerId !== undefined && customerId !== null && customerId !== '') {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!customer) return next(new AppError('Customer not found for this tenant.', 404));
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description || null;
    if (category !== undefined) data.category = category || null;
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return next(new AppError('Expense amount must be a valid number greater than 0.', 400));
      }
      data.amount = parsedAmount;
    }
    if (currency !== undefined) data.currency = currency || undefined;
    if (status !== undefined) {
      if (status !== existing.status && req.user.role !== 'ADMIN') {
        return next(new AppError('Only administrators can approve, reject, or change claim status.', 403));
      }
      data.status = status;
    }
    if (spentAt !== undefined) data.spentAt = spentAt ? new Date(spentAt) : existing.spentAt;
    if (customerId !== undefined) data.customerId = customerId || null;

    if (proofFileBase64) {
      const uploaded = await uploadExpenseProof({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        base64File: proofFileBase64,
        fileName: proofFileName,
        mimeType: proofMimeType,
      });

      if (existing.proofPath) {
        await deleteExpenseProof(existing.proofPath);
      }

      data.proofUrl = uploaded.proofUrl;
      data.proofPath = uploaded.proofPath;
      data.proofFileName = proofFileName || null;
      data.proofMimeType = proofMimeType || null;
      uploadedProofPath = uploaded.proofPath;
    } else {
      if (removeProof === true && existing.proofPath) {
        await deleteExpenseProof(existing.proofPath);
        data.proofUrl = null;
        data.proofPath = null;
        data.proofFileName = null;
        data.proofMimeType = null;
      } else {
        if (proofUrl !== undefined) data.proofUrl = proofUrl || null;
        if (proofPath !== undefined) data.proofPath = proofPath || null;
        if (proofFileName !== undefined) data.proofFileName = proofFileName || null;
        if (proofMimeType !== undefined) data.proofMimeType = proofMimeType || null;
      }
    }

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    const wasApproved = existing.status === 'APPROVED';
    const isApproved = expense.status === 'APPROVED';
    let reimbursementChange = 0;

    if (!wasApproved && isApproved) {
      reimbursementChange = expense.amount;
    } else if (wasApproved && !isApproved) {
      reimbursementChange = -existing.amount;
    } else if (wasApproved && isApproved) {
      reimbursementChange = expense.amount - existing.amount;
    }

    if (reimbursementChange !== 0) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { nextSalaryReimbursement: { increment: reimbursementChange } }
      });
    }

    res.status(200).json({ status: 'success', data: { expense } });
  } catch (err) {
    if (uploadedProofPath) {
      try {
        await deleteExpenseProof(uploadedProofPath);
      } catch (cleanupErr) {
        console.error(cleanupErr);
      }
    }
    next(err);
  }
};

// DELETE /api/expenses/:id
const deleteExpense = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    const existing = await prisma.expense.findFirst({ where });
    if (!existing) return next(new AppError('Expense not found.', 404));

    if (existing.proofPath) {
      await deleteExpenseProof(existing.proofPath);
    }

    await prisma.expense.delete({ where: { id: existing.id } });

    if (existing.status === 'APPROVED') {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { nextSalaryReimbursement: { decrement: existing.amount } }
      });
    }

    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
};
