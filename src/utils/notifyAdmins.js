const prisma = require('../lib/prisma');
const { createNotification } = require('../services/notificationService');

/**
 * Sends a notification to every ADMIN in the given tenant.
 * Skips the user who triggered the action (no self-spam).
 *
 * @param {object} opts
 * @param {string}   opts.tenantId      - tenant to look up admins for
 * @param {string}   [opts.excludeId]   - userId to skip (the actor)
 * @param {string}   opts.type          - notification type constant
 * @param {string}   opts.title         - short heading
 * @param {string}   opts.body          - description
 * @param {string}   [opts.linkUrl]     - optional deep-link
 */
async function notifyAdmins({ tenantId, excludeId, type, title, body, linkUrl }) {
  try {
    const admins = await prisma.user.findMany({
      where: { tenantId, role: 'ADMIN' },
      select: { id: true },
    });

    await Promise.all(
      admins
        .filter(a => a.id !== excludeId)
        .map(a =>
          createNotification({ tenantId, userId: a.id, type, title, body, linkUrl })
            .catch(err => console.error('[notifyAdmins] failed for', a.id, err.message))
        )
    );
  } catch (err) {
    console.error('[notifyAdmins] error fetching admins:', err.message);
  }
}

module.exports = { notifyAdmins };
