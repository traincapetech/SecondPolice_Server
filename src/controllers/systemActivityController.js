const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

exports.getActivities = async (req, res, next) => {
  try {
    const activities = await prisma.systemActivity.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100, // limit to 100 most recent
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    res.status(200).json({
      status: 'success',
      results: activities.length,
      data: { activities }
    });
  } catch (error) {
    next(error);
  }
};
