const prisma = require('../lib/prisma');
const { getIO } = require('../lib/socket');
const webpush = require('../lib/webpush');

/**
 * Creates a notification record in the DB for a specific user,
 * then pushes it instantly via:
 *   1. Socket.IO  — real-time while the tab is open
 *   2. Web Push   — OS notification even when the tab is closed
 */
const createNotification = async ({ tenantId, userId, type, title, body, linkUrl }) => {
  const notification = await prisma.notification.create({
    data: { tenantId, userId, type, title, body, linkUrl: linkUrl || null },
  });

  // ── 1. Socket.IO push (instant, tab must be open) ─────────────────────────
  try {
    getIO().to(`user:${userId}`).emit('notification', notification);
    
    // Also log this as a SystemActivity so it stacks in the admin feed
    const systemActivity = await prisma.systemActivity.create({
      data: {
        tenantId,
        userId: null, // The actor is usually the system for notifications
        action: 'NOTIFICATION',
        entityType: 'Notification',
        entityId: notification.id,
        details: JSON.stringify({ message: `Notification: ${title}`, data: { type, body, linkUrl } }),
      }
    });
    getIO().to(`tenant:${tenantId}:admin`).emit('system_activity', systemActivity);
  } catch {
    // Socket.IO not ready — DB record still saved
  }

  // ── 2. Web Push (works even when tab is closed) ────────────────────────────
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const payload = JSON.stringify({ title, body, linkUrl: linkUrl || '/' });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        // 410 Gone / 404 Not Found = subscription expired, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('[WebPush] send error:', err.message);
        }
      }
    })
  );

  return notification;
};

module.exports = { createNotification };

