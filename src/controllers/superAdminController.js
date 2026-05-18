const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/**
 * Fetches high-level platform metrics for the Owner
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalRevenue,
      activeSubs,
      trialSubs,
      totalTenants,
      recentEvents
    ] = await Promise.all([
      prisma.billingEvent.aggregate({
        where: { type: 'PAYMENT_SUCCESS' },
        _sum: { amountInr: true }
      }),
      prisma.tenantSubscription.count({ where: { status: 'ACTIVE' } }),
      prisma.tenantSubscription.count({ where: { status: 'TRIALING' } }),
      prisma.tenant.count(),
      prisma.billingEvent.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { tenant: { select: { name: true } } }
      })
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        revenue: totalRevenue._sum.amountInr || 0,
        activeSubscriptions: activeSubs,
        trialing: trialSubs,
        totalCustomers: totalTenants,
        recentActivity: recentEvents
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all global configurations
 */
exports.getCompanyConfig = async (req, res, next) => {
  try {
    const config = await prisma.companyConfig.findMany();
    res.status(200).json({ status: 'success', data: config });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all tax configurations
 */
exports.getTaxConfigs = async (req, res, next) => {
  try {
    const tax = await prisma.taxConfig.findMany();
    res.status(200).json({ status: 'success', data: tax });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a specific company configuration key
 */
exports.updateConfig = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const config = await prisma.companyConfig.update({
      where: { key },
      data: { value }
    });
    res.status(200).json({ status: 'success', data: config });
  } catch (error) {
    next(error);
  }
};

/**
 * Update pricing plan details
 */
exports.updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, features, description } = req.body;
    
    const plan = await prisma.pricingPlan.update({
      where: { id },
      data: { name, features, description }
    });
    
    res.status(200).json({ status: 'success', data: plan });
  } catch (error) {
    next(error);
  }
};
