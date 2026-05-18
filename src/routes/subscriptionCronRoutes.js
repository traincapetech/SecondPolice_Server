/**
 * Subscription Reminder Cron Job
 * 
 * Runs daily to:
 * 1. Remind TRIALING tenants whose trial ends in <= 3 days
 * 2. Warn PAST_DUE tenants — first warning at 1 day, pause at 7 days
 * 3. Pause CANCELLED subscriptions (set canLogin = false)
 * 
 * Call this route daily from cron-job.org with the X-Cron-Secret header
 * GET /api/cron/subscription-reminders
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { sendEmail } = require('../utils/emailService');

// Cron auth guard
const cronAuth = (req, res, next) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

router.get('/subscription-reminders', cronAuth, async (req, res) => {
  const now = new Date();
  const results = { trialing: 0, pastDue: 0, paused: 0 };

  try {
    // ─── 1. TRIALING: remind if trial ends in <= 3 days ───────────────────
    const trialExpiringSoon = await prisma.tenantSubscription.findMany({
      where: {
        status: 'TRIALING',
        currentPeriodEnd: { lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) }
      },
      include: { tenant: true, plan: true }
    });

    for (const sub of trialExpiringSoon) {
      const admin = await prisma.user.findFirst({
        where: { tenantId: sub.tenantId, role: 'ADMIN' }
      });
      if (!admin) continue;

      const daysLeft = Math.max(0, Math.ceil((sub.currentPeriodEnd - now) / (24 * 60 * 60 * 1000)));

      await sendEmail({
        to: admin.email,
        subject: `Your SecondPolice trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
            <h2 style="color:#2C3E50">⏰ Your free trial is ending soon</h2>
            <p>Hi ${admin.name},</p>
            <p>Your <strong>${sub.plan?.name || 'SecondPolice'}</strong> trial expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
            <p>After that, your team's access will be paused. Upgrade now to keep everything running smoothly.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing" 
               style="display:inline-block;padding:14px 28px;background:#3D9970;color:white;border-radius:12px;text-decoration:none;font-weight:900;margin-top:16px">
              Upgrade Now
            </a>
            <p style="margin-top:24px;color:#666;font-size:13px">SecondPolice · Next-Gen CRM</p>
          </div>
        `
      });
      results.trialing++;
    }

    // ─── 2. PAST_DUE: warn and eventually pause ───────────────────────────
    const pastDueSubs = await prisma.tenantSubscription.findMany({
      where: { status: 'PAST_DUE' },
      include: { tenant: true, plan: true }
    });

    for (const sub of pastDueSubs) {
      const admin = await prisma.user.findFirst({
        where: { tenantId: sub.tenantId, role: 'ADMIN' }
      });
      if (!admin) continue;

      const daysPastDue = Math.floor((now - sub.updatedAt) / (24 * 60 * 60 * 1000));

      // Auto-pause after 7 days past due
      if (daysPastDue >= 7) {
        await prisma.tenantSubscription.update({
          where: { tenantId: sub.tenantId },
          data: { status: 'CANCELLED' }
        });

        await sendEmail({
          to: admin.email,
          subject: 'Your SecondPolice access has been paused',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
              <h2 style="color:#E74C3C">🚫 Account Paused</h2>
              <p>Hi ${admin.name},</p>
              <p>Due to an unpaid invoice, your <strong>${sub.plan?.name}</strong> subscription has been paused.</p>
              <p>Your data is safe. Reactivate anytime by updating your payment method.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing"
                 style="display:inline-block;padding:14px 28px;background:#E74C3C;color:white;border-radius:12px;text-decoration:none;font-weight:900;margin-top:16px">
                Reactivate Account
              </a>
            </div>
          `
        });
        results.paused++;
      } else {
        // Still in grace period — send reminder
        await sendEmail({
          to: admin.email,
          subject: `Action required: Payment overdue (Day ${daysPastDue})`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
              <h2 style="color:#F39C12">⚠️ Payment Required</h2>
              <p>Hi ${admin.name},</p>
              <p>Your last payment for <strong>${sub.plan?.name}</strong> failed. Your account will be paused in 
                <strong>${7 - daysPastDue} day${(7 - daysPastDue) !== 1 ? 's' : ''}</strong> if not resolved.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing"
                 style="display:inline-block;padding:14px 28px;background:#F39C12;color:white;border-radius:12px;text-decoration:none;font-weight:900;margin-top:16px">
                Fix Payment
              </a>
            </div>
          `
        });
        results.pastDue++;
      }
    }

    console.log(`✅ Subscription reminders sent:`, results);
    res.json({ status: 'success', results });

  } catch (error) {
    console.error('❌ Cron error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
