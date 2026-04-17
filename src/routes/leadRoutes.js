const express = require('express');
const leadController = require('../controllers/leadController');
const { authenticate } = require('../middlewares/authMiddleware');
const AppError = require('../utils/appError');

const router = express.Router();
router.use(authenticate);

// Helper: check Leads Management or Sales Pipeline access
const canRead = (req, res, next) => {
  if (req.user.role === 'ADMIN') return next();
  const perms = req.user.permissions || {};
  const hasRead =
    (perms['Leads Management'] && perms['Leads Management'] !== 'No Access') ||
    (perms['Sales Pipeline']   && perms['Sales Pipeline']   !== 'No Access');
  if (!hasRead) return next(new AppError('No permission to view leads', 403));
  next();
};

const canCreate = (req, res, next) => {
  if (req.user.role === 'ADMIN') return next();
  const perms = req.user.permissions || {};
  if (perms['Leads Management'] !== 'Read & Write')
    return next(new AppError('No permission to create leads', 403));
  next();
};

const canWrite = (req, res, next) => {
  if (req.user.role === 'ADMIN') return next();
  const perms = req.user.permissions || {};
  const hasWrite =
    perms['Leads Management'] === 'Read & Write' ||
    perms['Sales Pipeline']   === 'Read & Write';
  if (!hasWrite) return next(new AppError('No write permission for leads', 403));
  next();
};

router.get('/',       canRead,   leadController.getLeads);
router.post('/',      canCreate, leadController.createLead);   // only lead people can create
router.get('/:id',    canRead,   leadController.getLead);
router.put('/:id',    canWrite,  leadController.updateLead);   // sales can update status
router.delete('/:id', canWrite,  leadController.deleteLead);

module.exports = router;
