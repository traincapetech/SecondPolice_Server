const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/** GET /api/notifications — all notifs for the logged-in user */
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.status(200).json({
      status: 'success',
      data: { notifications, unreadCount },
    });
  } catch (err) { next(err); }
};

/** PATCH /api/notifications/:id/read — mark one as read */
exports.markRead = async (req, res, next) => {
  try {
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!notif) return next(new AppError('Notification not found.', 404));

    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });

    res.status(200).json({ status: 'success' });
  } catch (err) { next(err); }
};

/** PATCH /api/notifications/read-all — mark all as read */
exports.markAllRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.status(200).json({ status: 'success' });
  } catch (err) { next(err); }
};

/** DELETE /api/notifications — clear all for this user */
exports.clearAll = async (req, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.user.id } });
    res.status(204).send();
  } catch (err) { next(err); }
};
