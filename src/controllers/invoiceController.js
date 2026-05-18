const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const { generateAndSendInvoice } = require('../services/invoiceService');
const { notifyAdmins } = require('../utils/notifyAdmins');

const INVOICE_INCLUDE = {
  deal: { select: { id: true, title: true, stage: true } },
};

// GET /api/invoices
exports.getInvoices = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { tenantId: req.user.tenantId };
    if (status) where.status = status;
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }

    // Auto-flip SENT invoices that are past due date to OVERDUE
    await prisma.invoice.updateMany({
      where: {
        tenantId: req.user.tenantId,
        status:   'SENT',
        dueDate:  { lt: new Date() },
      },
      data: { status: 'OVERDUE' },
    });

    const invoices = await prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
  } catch (err) { next(err); }
};

// GET /api/invoices/:id
exports.getInvoice = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }
    const invoice = await prisma.invoice.findFirst({
      where,
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return next(new AppError('Invoice not found.', 404));
    res.status(200).json({ status: 'success', data: { invoice } });
  } catch (err) { next(err); }
};

// GET /api/invoices/:id/pdf  — streams the PDF to browser
exports.getInvoicePDF = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }
    const invoice = await prisma.invoice.findFirst({
      where,
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return next(new AppError('Invoice not found.', 404));

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true, companyProfile: true },
    });
    const pdfBuffer = await generateInvoicePDF(invoice, tenant);

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNo}.pdf"`,
      'Content-Length':      pdfBuffer.length,
    });
    res.end(pdfBuffer);
  } catch (err) { next(err); }
};

// POST /api/invoices/:id/send  — generate PDF + email + flip to SENT
exports.sendInvoice = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }
    const invoice = await prisma.invoice.findFirst({
      where,
    });
    if (!invoice) return next(new AppError('Invoice not found.', 404));
    if (invoice.status === 'PAID') return next(new AppError('This invoice is already paid.', 400));

    const tenant = await prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { name: true, companyProfile: true },
    });
    const updated = await generateAndSendInvoice(invoice.id, tenant);

    res.status(200).json({ status: 'success', message: 'Invoice sent successfully.', data: { invoice: updated } });

    // Notify admins — #8 Invoice sent
    notifyAdmins({
      tenantId: req.user.tenantId,
      excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
      type: 'INVOICE_SENT',
      title: '📧 Invoice Sent',
      body: `Invoice ${invoice.invoiceNo} was sent to ${invoice.clientEmail || invoice.clientName} by ${req.user.name}`,
      linkUrl: '/invoices',
    }).catch(console.error);
  } catch (err) { next(err); }
};

// PATCH /api/invoices/:id  — update notes, dueDate, status (mark PAID/CANCELLED), clientEmail
exports.updateInvoice = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }
    const existing = await prisma.invoice.findFirst({
      where,
    });
    if (!existing) return next(new AppError('Invoice not found.', 404));

    const { notes, dueDate, status, clientEmail, clientName } = req.body;
    const ALLOWED_STATUSES = ['DRAFT', 'PAID', 'CANCELLED'];

    const data = {};
    if (notes       !== undefined) data.notes       = notes || null;
    if (dueDate)                   data.dueDate      = new Date(dueDate);
    if (clientEmail !== undefined) data.clientEmail  = clientEmail || null;
    if (clientName  !== undefined) data.clientName   = clientName  || existing.clientName;
    if (status && ALLOWED_STATUSES.includes(status)) {
      data.status = status;
      if (status === 'PAID' && !existing.paidAt) data.paidAt = new Date();
    }

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data,
      include: INVOICE_INCLUDE,
    });

    res.status(200).json({ status: 'success', data: { invoice } });

    // Notify admins — #9 Invoice marked PAID
    if (status === 'PAID' && existing.status !== 'PAID') {
      notifyAdmins({
        tenantId: req.user.tenantId,
        excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
        type: 'INVOICE_PAID',
        title: '💰 Invoice Paid',
        body: `Invoice ${existing.invoiceNo} (${existing.clientName}) has been marked as paid`,
        linkUrl: '/invoices',
      }).catch(console.error);
    }
  } catch (err) { next(err); }
};

// DELETE /api/invoices/:id  — only DRAFT invoices
exports.deleteInvoice = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.deal = { assignedTo: req.user.id };
    }
    const existing = await prisma.invoice.findFirst({
      where,
    });
    if (!existing) return next(new AppError('Invoice not found.', 404));
    if (existing.status !== 'DRAFT') return next(new AppError('Only DRAFT invoices can be deleted.', 400));

    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
};
