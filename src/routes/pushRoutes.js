const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/push/vapid-public-key
 * Returns the server's VAPID public key so the client can subscribe.
 */
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 * Saves (or upserts) the browser push subscription for this user.
 */
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ status: 'fail', message: 'Invalid subscription object.' });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId:  req.user.id,
      endpoint,
      p256dh:  keys.p256dh,
      auth:    keys.auth,
    },
    update: {
      userId:  req.user.id,   // re-assign if same endpoint used by a different login
      p256dh:  keys.p256dh,
      auth:    keys.auth,
    },
  });

  res.status(201).json({ status: 'success' });
});

/**
 * DELETE /api/push/unsubscribe
 * Body: { endpoint }
 * Removes the subscription (called when user revokes permission).
 */
router.delete('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ status: 'fail', message: 'endpoint required.' });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
  res.status(204).send();
});

module.exports = router;
