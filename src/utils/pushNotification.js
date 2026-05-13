const admin = require('firebase-admin');
const prisma = require('../lib/prisma');
const path = require('path');

// Initialize Firebase Admin (idempotent — only runs once)
if (!admin.apps.length) {
  try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const accountPath = path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
        ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        : path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      serviceAccount = require(accountPath);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
      );
    }

    if (serviceAccount) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('[FCM] Firebase Admin initialized successfully');
    } else {
      console.warn('[FCM] Firebase Admin not initialized: Missing FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64');
    }
  } catch (error) {
    console.error('[FCM] Failed to initialize Firebase Admin:', error.message);
  }
}

/**
 * Send a push notification to ALL admins in a given tenant.
 *
 * @param {object} opts
 * @param {string}  opts.tenantId  - Tenant to target
 * @param {string}  opts.title     - Notification title
 * @param {string}  opts.body      - Notification body text
 * @param {object}  [opts.data]    - Custom data payload (include `screen` for deep-linking)
 */
const notifyAdmins = async ({ tenantId, title, body, data = {} }) => {
  try {
    if (!admin.apps.length) return; // Firebase not configured — silently skip

    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ADMIN',
        fcmToken: { not: null },
      },
      select: { fcmToken: true },
    });

    const tokens = admins.map(a => a.fcmToken).filter(Boolean);
    if (tokens.length === 0) return;

    // Stringify all data values (FCM requires string values in data payload)
    const stringifiedData = Object.fromEntries(
      Object.entries({ ...data, title, body }).map(([k, v]) => [k, String(v ?? '')])
    );

    const message = {
      notification: { title, body },
      data: stringifiedData,
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up any dead/invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokens[idx]);
          }
        }
      });
      if (failedTokens.length > 0) {
        await prisma.user.updateMany({
          where: { fcmToken: { in: failedTokens } },
          data: { fcmToken: null },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[FCM] notifyAdmins error:', err.message);
  }
};

module.exports = { notifyAdmins };
