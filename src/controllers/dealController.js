const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { createInvoiceFromDeal } = require('../services/invoiceService');
const { notifyAdmins } = require('../utils/notifyAdmins');

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
        lead: true,
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
    const { title, value, tokenAmount, stage, assignedTo, currency, contactPerson, company, email, phone } = req.body;
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
        contactPerson,
        company,
        email,
        phone,
      },
      include: { 
        user: { select: { id: true, name: true } },
        lead: true,
      },

    });

    res.status(201).json({ status: 'success', data: { deal } });

    // Notify admins — #4 New deal created
    notifyAdmins({
      tenantId: req.user.tenantId,
      excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
      type: 'DEAL_CREATED',
      title: '💼 New Deal Created',
      body: `${req.user.name} created a new deal: "${deal.title}"`,
      linkUrl: '/deals',
    }).catch(console.error);
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

    const { title, value, tokenAmount, stage, assignedTo, currency, contactPerson, company, email, phone } = req.body;

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existing.title,
        value: value !== undefined && value !== '' ? parseFloat(value) : existing.value,
        tokenAmount: tokenAmount !== undefined && tokenAmount !== '' ? parseFloat(tokenAmount) : existing.tokenAmount,
        stage: stage || existing.stage,
        currency: currency || existing.currency,
        ...(assignedTo !== undefined && { assignedTo }),
        ...(currency   && { currency }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(company !== undefined && { company }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
      include: { 
        user: { select: { id: true, name: true } },
        lead: true,
      },

    });

    res.status(200).json({ status: 'success', data: { deal } });

    // Notify admins on stage changes (#5 WON, #6 LOST, #7 stage changed)
    if (stage && stage !== existing.stage) {
      const isWon  = stage === 'WON';
      const isLost = stage === 'LOST';
      notifyAdmins({
        tenantId: req.user.tenantId,
        excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
        type: isWon ? 'DEAL_WON' : isLost ? 'DEAL_LOST' : 'DEAL_STAGE_CHANGED',
        title: isWon  ? '🏆 Deal Won!'       :
               isLost ? '❌ Deal Lost'        :
                        '🔄 Deal Stage Updated',
        body: isWon  ? `${req.user.name} closed "${deal.title}" as WON` :
              isLost ? `${req.user.name} marked "${deal.title}" as LOST` :
                       `${req.user.name} moved "${deal.title}" to ${stage}`,
        linkUrl: '/deals',
      }).catch(console.error);
    }

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
