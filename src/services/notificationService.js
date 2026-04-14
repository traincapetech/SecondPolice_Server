const prisma = require('../lib/prisma');

/**
 * Creates a notification record in the DB for a specific user.
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.userId     - recipient's user ID
 * @param {string} opts.type       - e.g. 'LEAD_ASSIGNED'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.linkUrl]  - optional frontend URL to navigate to
 */
const createNotification = async ({ tenantId, userId, type, title, body, linkUrl }) => {
  return prisma.notification.create({
    data: { tenantId, userId, type, title, body, linkUrl: linkUrl || null },
  });
};

module.exports = { createNotification };
