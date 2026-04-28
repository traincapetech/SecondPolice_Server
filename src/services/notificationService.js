const prisma = require('../lib/prisma');
const { getIO } = require('../lib/socket');

/**
 * Creates a notification record in the DB for a specific user,
 * then pushes it instantly via Socket.IO to the recipient's room.
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.userId     - recipient's user ID
 * @param {string} opts.type       - e.g. 'LEAD_ASSIGNED'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.linkUrl]  - optional frontend URL to navigate to
 */
const createNotification = async ({ tenantId, userId, type, title, body, linkUrl }) => {
  const notification = await prisma.notification.create({
    data: { tenantId, userId, type, title, body, linkUrl: linkUrl || null },
  });

  // Push to the recipient immediately via WebSocket (fire-and-forget)
  try {
    getIO().to(`user:${userId}`).emit('notification', notification);
  } catch {
    // Socket.IO not ready (e.g. during tests) — DB record still saved, polling fallback works
  }

  return notification;
};

module.exports = { createNotification };
