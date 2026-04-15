const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

const VALID_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK'];

// GET /api/activities
const getActivities = async (req, res, next) => {
  try {
    const { type, completed, customerId, dealId } = req.query;

    const where = { tenantId: req.user.tenantId };

    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (customerId) where.customerId = customerId;
    if (dealId) where.dealId = dealId;
    if (completed === 'true')  where.completedAt = { not: null };
    if (completed === 'false') where.completedAt = null;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        user:     { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal:     { select: { id: true, title: true } },
      },
      orderBy: [{ completedAt: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    res.status(200).json({ status: 'success', results: activities.length, data: { activities } });
  } catch (err) {
    next(err);
  }
};

// POST /api/activities
const createActivity = async (req, res, next) => {
  try {
    const { type, title, notes, dueDate, customerId, dealId } = req.body;
    if (!title) return next(new AppError('Activity title is required.', 400));

    const activity = await prisma.activity.create({
      data: {
        tenantId:   req.user.tenantId,
        userId:     req.user.id,
        type:       type || 'TASK',
        title,
        notes:      notes    || null,
        dueDate:    dueDate  ? new Date(dueDate) : null,
        customerId: customerId ? customerId : null,
        dealId:     dealId     ? dealId     : null,
      },
      include: {
        user:     { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal:     { select: { id: true, title: true } },
      },
    });

    res.status(201).json({ status: 'success', data: { activity } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/activities/:id
const updateActivity = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.activity.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!existing) return next(new AppError('Activity not found.', 404));

    const { type, title, notes, dueDate, customerId, dealId, completed } = req.body;

    const activity = await prisma.activity.update({
      where: { id },
      data: {
        ...(type       && { type }),
        ...(title      && { title }),
        ...(notes      !== undefined && { notes: notes || null }),
        ...(dueDate    !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(customerId !== undefined && { customerId: customerId || null }),
        ...(dealId     !== undefined && { dealId: dealId || null }),
        // Toggle completion
        ...(completed === true  && { completedAt: new Date() }),
        ...(completed === false && { completedAt: null }),
      },
      include: {
        user:     { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal:     { select: { id: true, title: true } },
      },
    });

    res.status(200).json({ status: 'success', data: { activity } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/activities/:id
const deleteActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.activity.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!existing) return next(new AppError('Activity not found.', 404));

    await prisma.activity.delete({ where: { id } });
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

module.exports = { getActivities, createActivity, updateActivity, deleteActivity };
