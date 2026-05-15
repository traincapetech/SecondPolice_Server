const prisma = require('../lib/prisma');

// GET /api/dashboard/stats - Aggregate stats for the authenticated tenant
const getDashboardStats = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    const baseDealWhere = { tenantId };
    if (req.user.role !== 'ADMIN') {
      baseDealWhere.assignedTo = req.user.id;
    }

    const [
      totalDeals,
      wonDeals,
      revenueAgg,
      dealsByStage,
      rawCustomers,
      rawLeads,
    ] = await Promise.all([
      // Total active deals (not lost)
      prisma.deal.count({ where: { ...baseDealWhere, NOT: { stage: 'LOST' } } }),

      // Won deals count
      prisma.deal.count({ where: { ...baseDealWhere, stage: 'WON' } }),

      // Sum of value for WON deals (revenue)
      prisma.deal.aggregate({
        where: { ...baseDealWhere, stage: 'WON' },
        _sum: { value: true },
      }),

      // Deals grouped by stage for the pipeline chart
      prisma.deal.groupBy({
        by: ['stage'],
        where: baseDealWhere,
        _count: { id: true },
        _sum: { value: true },
      }),

      // Fetch all customers for unified count/recent
      // If employee, return empty array to only show their own leads as customers
      req.user.role !== 'ADMIN' 
        ? Promise.resolve([])
        : prisma.customer.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
          }),

      // Fetch leads for unified count/recent
      prisma.lead.findMany({
        where: req.user.role !== 'ADMIN' 
          ? { tenantId, OR: [{ createdById: req.user.id }, { assignedToId: req.user.id }] }
          : { tenantId },
        orderBy: { createdAt: 'desc' },
      })
    ]);

    const uniqueMap = new Map();
    rawCustomers.forEach(c => uniqueMap.set(c.email?.toLowerCase() || c.name.toLowerCase(), c));
    rawLeads.forEach(l => {
      const key = l.email?.toLowerCase() || `${l.firstName} ${l.lastName || ''}`.trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          id: l.id,
          tenantId: l.tenantId,
          name: `${l.firstName} ${l.lastName || ''}`.trim(),
          email: l.email,
          phone: l.phone,
          status: l.status,
          createdAt: l.createdAt,
        });
      } else {
        const existing = uniqueMap.get(key);
        existing.status = l.status;
      }
    });

    const unifiedCustomers = Array.from(uniqueMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    const totalCustomers = unifiedCustomers.length;
    const recentCustomers = unifiedCustomers.slice(0, 5).map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      status: c.status,
      createdAt: c.createdAt
    }));

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
