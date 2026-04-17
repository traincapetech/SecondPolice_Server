const prisma = require('../lib/prisma');

// GET /api/dashboard/stats - Aggregate stats for the authenticated tenant
const getDashboardStats = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    const [
      totalCustomers,
      totalDeals,
      wonDeals,
      revenueAgg,
      dealsByStage,
      recentCustomers,
    ] = await Promise.all([
      // Total customers
      prisma.customer.count({ where: { tenantId } }),

      // Total active deals (not lost)
      prisma.deal.count({ where: { tenantId, NOT: { stage: 'LOST' } } }),

      // Won deals count
      prisma.deal.count({ where: { tenantId, stage: 'WON' } }),

      // Sum of value for WON deals (revenue)
      prisma.deal.aggregate({
        where: { tenantId, stage: 'WON' },
        _sum: { value: true },
      }),

      // Deals grouped by stage for the pipeline chart
      prisma.deal.groupBy({
        by: ['stage'],
        where: { tenantId },
        _count: { id: true },
        _sum: { value: true },
      }),

      // Recent 5 customers
      prisma.customer.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, status: true, createdAt: true },
      }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalCustomers,
          totalDeals,
          wonDeals,
          totalRevenue: revenueAgg._sum.value || 0,
        },
        dealsByStage,
        recentCustomers,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboardStats };
