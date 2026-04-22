const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { createInvoiceFromDeal } = require('../services/invoiceService');

const VALID_STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

// GET /api/deals - List all deals for the current tenant
const getDeals = async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.assignedTo = req.user.id;
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      results: deals.length,
      data: { deals },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/deals - Create a new deal
const createDeal = async (req, res, next) => {
  try {
    const { title, value, tokenAmount, stage, assignedTo, currency } = req.body;
    if (!title) return next(new AppError('Deal title is required.', 400));

    const deal = await prisma.deal.create({
      data: {
        tenantId: req.user.tenantId,
        title,
        value: parseFloat(value) || 0,
        tokenAmount: parseFloat(tokenAmount) || 0,
        currency: currency || 'USD',
        stage: stage || 'LEAD',
        assignedTo: assignedTo || req.user.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    res.status(201).json({ status: 'success', data: { deal } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/deals/:id - Update a deal (including moving Kanban stage)
const updateDeal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const where = { id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.assignedTo = req.user.id;
    }

    const existing = await prisma.deal.findFirst({
      where,
    });
    if (!existing) return next(new AppError('Deal not found or you do not have permission.', 404));

    const { title, value, tokenAmount, stage, assignedTo, currency } = req.body;

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existing.title,
        value: value !== undefined && value !== '' ? parseFloat(value) : existing.value,
        tokenAmount: tokenAmount !== undefined && tokenAmount !== '' ? parseFloat(tokenAmount) : existing.tokenAmount,
        stage: stage || existing.stage,
        currency: currency || existing.currency,
        ...(assignedTo !== undefined && { assignedTo }),
      },
      include: { user: { select: { id: true, name: true } } },
    });

    res.status(200).json({ status: 'success', data: { deal } });

    // Auto-create DRAFT invoice when deal is moved to WON for the first time
    if (stage === 'WON' && existing.stage !== 'WON') {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: req.user.tenantId },
          select: { id: true, name: true, taxRate: true, displayCurrency: true },
        });
        await createInvoiceFromDeal(
          { ...deal, leadId: existing.leadId },
          tenant
        );
      } catch (invoiceErr) {
        console.error('[Invoice] Failed to auto-create invoice for deal WON:', invoiceErr.message);
      }
    }
  } catch (err) {
    next(err);
  }
};

// DELETE /api/deals/:id - Delete a deal
const deleteDeal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const where = { id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.assignedTo = req.user.id;
    }

    const existing = await prisma.deal.findFirst({
      where,
    });
    if (!existing) return next(new AppError('Deal not found or you do not have permission', 404));

    await prisma.deal.delete({ where: { id } });
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDeals, createDeal, updateDeal, deleteDeal };
