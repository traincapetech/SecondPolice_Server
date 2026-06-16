const prisma = require('../lib/prisma');

// GET /api/reports/overview
// Returns: monthly revenue (last 12 months), deal funnel, win rate, avg deal size
const getOverview = async (req, res, next) => {
  try {
    const { tenantId, role, id: userId } = req.user;
    const isAdmin = role === 'ADMIN';

    // Base filters for RBAC
    const dealFilter = { tenantId };
    if (!isAdmin) dealFilter.assignedTo = userId;

    const activityFilter = { tenantId };
    if (!isAdmin) activityFilter.userId = userId;

    // --- Monthly revenue (last 12 months, WON deals only) ---
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const wonDeals = await prisma.deal.findMany({
      where: {
        ...dealFilter,
        stage: 'WON',
        createdAt: { gte: twelveMonthsAgo },
      },
      select: { value: true, createdAt: true },
    });

    // Group into month buckets
    const monthMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = { month: key, revenue: 0, deals: 0 };
    }
    wonDeals.forEach(deal => {
      const d = new Date(deal.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthMap[key]) {
        monthMap[key].revenue += Number(deal.value);
        monthMap[key].deals   += 1;
      }
    });
    const revenueByMonth = Object.values(monthMap);

    // --- Deal funnel by stage ---
    const dealsByStage = await prisma.deal.groupBy({
      by: ['stage'],
      where: dealFilter,
      _count: { id: true },
      _sum:   { value: true },
    });

    // --- Win rate ---
    const [won, lost] = await Promise.all([
      prisma.deal.count({ where: { ...dealFilter, stage: 'WON' } }),
      prisma.deal.count({ where: { ...dealFilter, stage: 'LOST' } }),
    ]);
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    // --- Average deal size (all deals with value > 0) ---
    const avgResult = await prisma.deal.aggregate({
      where:  { ...dealFilter, value: { gt: 0 } },
      _avg:   { value: true },
      _count: { id: true },
    });
    const avgDealSize = Math.round(avgResult._avg.value || 0);

    // --- Activity summary ---
    const [totalActivities, completedActivities] = await Promise.all([
      prisma.activity.count({ where: activityFilter }),
      prisma.activity.count({ where: { ...activityFilter, completedAt: { not: null } } }),
    ]);

    // --- Customer growth (last 6 months) - ADMIN ONLY ---
    let customerGrowth = [];
    if (isAdmin) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const newCustomers = await prisma.customer.findMany({
        where:  { tenantId, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      });

      const customerMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        customerMap[key] = { month: key, count: 0 };
      }
      newCustomers.forEach(c => {
        const d = new Date(c.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (customerMap[key]) customerMap[key].count++;
      });
      customerGrowth = Object.values(customerMap);
    }

    res.status(200).json({
      status: 'success',
      data: {
        revenueByMonth,
        dealsByStage,
        winRate,
        avgDealSize,
        totalActivities,
        completedActivities,
        customerGrowth,
        totalDeals:  avgResult._count.id,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOverview };
