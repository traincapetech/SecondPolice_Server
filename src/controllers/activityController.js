const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { createNotification } = require('../services/notificationService');
const { notifyAdmins } = require('../utils/notifyAdmins');

const VALID_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK'];

// GET /api/activities
const getActivities = async (req, res, next) => {
  try {
    const { type, completed, customerId, dealId, todaySync, endDate } = req.query;
    const where = { tenantId: req.user.tenantId };
    
    // Strict Privacy Rules for Non-Admins
    if (req.user.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (customerId) where.customerId = customerId;
    if (dealId) where.dealId = dealId;

    // Today's Sync Logic (For Dashboard)
    if (todaySync === 'true') {
      const now = new Date();
      const startOfToday = new Date(new Date(now).setHours(0,0,0,0));
      const endOfToday = new Date(new Date(now).setHours(23,59,59,999));
      
      where.OR = [
        // 1. Incomplete tasks due today or in the past
        { dueDate: { lte: endOfToday }, completedAt: null },
        // 2. Tasks completed today (regardless of due date)
        { completedAt: { gte: startOfToday, lte: endOfToday } }
      ];
    } else {
      if (completed === 'true')  where.completedAt = { not: null };
      if (completed === 'false') where.completedAt = null;
      if (endDate) where.dueDate = { lte: new Date(endDate) };
    }

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
    const { type, title, notes, dueDate, customerId, dealId, assignedToId } = req.body;
    if (!title) return next(new AppError('Activity title is required.', 400));

    const assigneeId = assignedToId || req.user.id;

    const activity = await prisma.activity.create({
      data: {
        tenantId:   req.user.tenantId,
        userId:     assigneeId,
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

    // Fire assignment notification if assigned to someone else
    if (assigneeId !== req.user.id) {
      createNotification({
        tenantId: req.user.tenantId,
        userId: assigneeId,
        type: 'TASK_ASSIGNED',
        title: 'New Activity Assigned To You',
        body: `You have been assigned a new ${activity.type.toLowerCase()}: ${title}`,
        linkUrl: `/activities`,
      }).catch(console.error);
    }
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

    const { type, title, notes, dueDate, customerId, dealId, completed, assignedToId } = req.body;

    const activity = await prisma.activity.update({
      where: { id },
      data: {
        ...(assignedToId && { userId: assignedToId }),
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

    // Notify admins — #14 Activity completed
    if (completed === true && !existing.completedAt) {
      notifyAdmins({
        tenantId: req.user.tenantId,
        excludeId: req.user.role === 'ADMIN' ? req.user.id : undefined,
        type: 'ACTIVITY_COMPLETED',
        title: '✅ Activity Completed',
        body: `${req.user.name} completed: "${activity.title}"`,
        linkUrl: '/activities',
      }).catch(console.error);
    }

    // Fire assignment notification if assignment changed
    if (assignedToId && assignedToId !== existing.userId) {
      createNotification({
        tenantId: req.user.tenantId,
        userId: assignedToId,
        type: 'TASK_ASSIGNED',
        title: 'Activity Reassigned To You',
        body: `An activity has been reassigned to you: ${title || existing.title}`,
        linkUrl: `/activities`,
      }).catch(console.error);
    }
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
