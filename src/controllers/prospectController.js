const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { notifyAdmins } = require('../utils/notifyAdmins');
const { notifyAdmins: pushAdmins } = require('../utils/pushNotification');

const PROSPECT_SELECT = {
  id: true,
  tenantId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  source: true,
  sourceDetail: true,
  status: true,
  priority: true,
  detail: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      companySize: true,
      budget: true,
      currency: true,
      serviceInterest: true,
      requirements: true,
      lastContact: true,
      nextFollowup: true,
      contactMethod: true,
      linkedin: true,
      notes: true,
    }
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

/** GET /api/prospects */
exports.getAllProspects = async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };

    // Access Control: Admins see all, others see only their own
    if (req.user.role !== 'ADMIN') {
      where.createdById = req.user.id;
    }

    const prospects = await prisma.prospectMeta.findMany({
      where,
      select: PROSPECT_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      results: prospects.length,
      data: { prospects }
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/prospects/:id */
exports.getProspect = async (req, res, next) => {
  try {
    const where = { 
      id: req.params.id, 
      tenantId: req.user.tenantId 
    };

    // Access Control
    if (req.user.role !== 'ADMIN') {
      where.createdById = req.user.id;
    }

    const prospect = await prisma.prospectMeta.findFirst({
      where,
      select: PROSPECT_SELECT,
    });

    if (!prospect) {
      return next(new AppError('Prospect not found or you do not have permission to access it', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { prospect }
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/prospects */
exports.createProspect = async (req, res, next) => {
  try {
    const {
      source, sourceDetail, status, priority,
      name, email, phone, company, companySize, budget, currency,
      serviceInterest, requirements, lastContact, nextFollowup,
      contactMethod, linkedin, notes
    } = req.body;

    if (!name) {
      return next(new AppError('Prospect name is required', 400));
    }

    // Create both Meta and Detail in a transaction
    const prospect = await prisma.$transaction(async (tx) => {
      const meta = await tx.prospectMeta.create({
        data: {
          tenantId: req.user.tenantId,
          createdById: req.user.id,
          source,
          sourceDetail,
          status: status || 'NEW',
          priority: priority || 'MEDIUM',
          detail: {
            create: {
              name,
              email,
              phone,
              company,
              companySize,
              budget: budget ? parseFloat(budget) : null,
              currency: currency || 'USD',
              serviceInterest,
              requirements,
              lastContact: lastContact ? new Date(lastContact) : null,
              nextFollowup: nextFollowup ? new Date(nextFollowup) : null,
              contactMethod,
              linkedin,
              notes
            }
          }
        },
        select: PROSPECT_SELECT
      });
      return meta;
    });

    res.status(201).json({
      status: 'success',
      data: { prospect }
    });

    // Notify admins — #15 New prospect created
    notifyAdmins({
      tenantId: req.user.tenantId,
      excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
      type: 'PROSPECT_CREATED',
      title: '🔍 New Prospect Added',
      body: `${req.user.name} added a new prospect: ${name}`,
      linkUrl: '/prospects',
    }).catch(console.error);

    // FCM push to admins — New Prospect
    try {
      await pushAdmins({
        tenantId: req.user.tenantId,
        title: '👤 New Prospect',
        body: `${name} added as prospect`,
        data: { screen: 'MainTabs' },
      });
    } catch (e) { console.error('[FCM] prospect create push failed:', e.message); }
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/prospects/:id */
exports.updateProspect = async (req, res, next) => {
  try {
    const where = { 
      id: req.params.id, 
      tenantId: req.user.tenantId 
    };

    // Access Control
    if (req.user.role !== 'ADMIN') {
      where.createdById = req.user.id;
    }

    const existing = await prisma.prospectMeta.findFirst({ where });

    if (!existing) {
      return next(new AppError('Prospect not found or you do not have permission to modify it', 404));
    }

    const {
      source, sourceDetail, status, priority,
      name, email, phone, company, companySize, budget, currency,
      serviceInterest, requirements, lastContact, nextFollowup,
      contactMethod, linkedin, notes
    } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      return await tx.prospectMeta.update({
        where: { id: req.params.id },
        data: {
          source,
          sourceDetail,
          status,
          priority,
          detail: {
            update: {
              name,
              email,
              phone,
              company,
              companySize,
              budget: budget !== undefined ? (budget ? parseFloat(budget) : null) : undefined,
              currency,
              serviceInterest,
              requirements,
              lastContact: lastContact ? new Date(lastContact) : undefined,
              nextFollowup: nextFollowup ? new Date(nextFollowup) : undefined,
              contactMethod,
              linkedin,
              notes
            }
          }
        },
        select: PROSPECT_SELECT
      });
    });

    res.status(200).json({
      status: 'success',
      data: { prospect: updated }
    });

    // Notify admins — #16 Prospect converted
    if (status === 'CONVERTED' && existing.status !== 'CONVERTED') {
      notifyAdmins({
        tenantId: req.user.tenantId,
        excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
        type: 'PROSPECT_CONVERTED',
        title: '🎉 Prospect Converted',
        body: `${req.user.name} converted a prospect to a lead`,
        linkUrl: '/prospects',
      }).catch(console.error);
    }
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/prospects/:id */
exports.deleteProspect = async (req, res, next) => {
  try {
    const where = { 
      id: req.params.id, 
      tenantId: req.user.tenantId 
    };

    // Access Control
    if (req.user.role !== 'ADMIN') {
      where.createdById = req.user.id;
    }

    const prospect = await prisma.prospectMeta.findFirst({ where });

    if (!prospect) {
      return next(new AppError('Prospect not found or you do not have permission to delete it', 404));
    }

    await prisma.prospectMeta.delete({
      where: { id: req.params.id }
    });

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    next(err);
  }
};
