const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/**
 * Subscription Gate Middleware
 * 
 * ACTIVE      → Full access
 * TRIALING    → Full access (reminder emailed separately via cron)
 * PAST_DUE    → Read-only, blocks mutations (POST/PUT/PATCH/DELETE)
 * CANCELLED   → Block everything, redirect to upgrade
 * No Sub      → Block everything, redirect to upgrade
 */
const subscriptionGate = async (req, res, next) => {
  try {
    // SuperAdmin bypasses all subscription checks
    if (req.user?.role === 'SUPERADMIN') return next();

    // System/cron routes bypass
    const bypassPaths = [
      '/api/auth', '/api/billing', '/api/pricing',
      '/api/webhooks', '/api/health', '/api/push',
      '/api/cron', '/api/notifications',
    ];
    if (bypassPaths.some(p => req.originalUrl.startsWith(p))) return next();

    const tenantId = req.user?.tenantId;
    if (!tenantId) return next();

    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId }
    });

    // No subscription — treat as free tier (limited access)
    if (!sub) {
      // Allow read-only GET requests for now (free tier)
      if (req.method !== 'GET') {
        return res.status(402).json({
          status: 'payment_required',
          code: 'NO_SUBSCRIPTION',
          message: 'Please subscribe to a plan to use this feature.',
          upgradeUrl: '/dashboard/billing'
        });
      }
      return next();
    }

    // ACTIVE or TRIALING → Full access
    if (sub.status === 'ACTIVE' || sub.status === 'TRIALING') {
      // Attach subscription info to request for use in controllers
      req.subscription = sub;
      return next();
    }

    // PAST_DUE → Block all mutations
    if (sub.status === 'PAST_DUE') {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return res.status(402).json({
          status: 'payment_required',
          code: 'PAST_DUE',
          message: 'Your payment is overdue. Please update your billing details to continue.',
          upgradeUrl: '/dashboard/billing'
        });
      }
      req.subscription = sub;
      return next();
    }

    // CANCELLED or any other state → Block all
    return res.status(402).json({
      status: 'payment_required',
      code: 'SUBSCRIPTION_CANCELLED',
      message: 'Your subscription has been cancelled. Please choose a new plan to continue.',
      upgradeUrl: '/#pricing'
    });

  } catch (error) {
    // Don't block users if subscription check fails — log and continue
    console.error('⚠️ Subscription gate error:', error.message);
    next();
  }
};

module.exports = { subscriptionGate };
