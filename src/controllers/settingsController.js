const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/** GET /api/settings */
exports.getSettings = async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { id: true, name: true, displayCurrency: true },
    });
    if (!tenant) return next(new AppError('Workspace not found.', 404));
    res.status(200).json({ status: 'success', data: { settings: tenant } });
  } catch (err) { next(err); }
};

/** PATCH /api/settings/currency */
exports.updateDisplayCurrency = async (req, res, next) => {
  try {
    const { displayCurrency } = req.body;
    if (!displayCurrency) return next(new AppError('displayCurrency is required.', 400));

    const VALID = ['USD','EUR','GBP','INR','AED','JPY','CAD','AUD','SGD','SAR'];
    if (!VALID.includes(displayCurrency)) {
      return next(new AppError(`Unsupported currency: ${displayCurrency}`, 400));
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.user.tenantId },
      data: { displayCurrency },
      select: { id: true, displayCurrency: true },
    });

    res.status(200).json({ status: 'success', data: { settings: tenant } });
  } catch (err) { next(err); }
};

/** PATCH /api/settings/workspace */
exports.updateWorkspace = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return next(new AppError('Company name is required.', 400));
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.user.tenantId },
      data: { name: name.trim() },
      select: { id: true, name: true, displayCurrency: true },
    });

    res.status(200).json({ status: 'success', data: { settings: tenant } });
  } catch (err) { next(err); }
};
