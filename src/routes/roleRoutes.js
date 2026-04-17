const express = require('express');
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middlewares/authMiddleware');
const AppError = require('../utils/appError');

const router = express.Router();

// All role routes require authentication
router.use(authenticate);

// Read access: user has any non-"No Access" level on 'Roles' OR 'Settings'
const canRead = (req, res, next) => {
  if (req.user.role === 'ADMIN') return next();
  const perms = req.user.permissions || {};
  const hasRead =
    (perms['Roles']    && perms['Roles']    !== 'No Access') ||
    (perms['Settings'] && perms['Settings'] !== 'No Access');
  if (!hasRead) {
    return next(new AppError('You do not have permission to view roles', 403));
  }
  next();
};

// Write access: user has 'Read & Write' on 'Roles' OR 'Settings'
const canWrite = (req, res, next) => {
  if (req.user.role === 'ADMIN') return next();
  const perms = req.user.permissions || {};
  const hasWrite =
    perms['Roles']    === 'Read & Write' ||
    perms['Settings'] === 'Read & Write';
  if (!hasWrite) {
    return next(new AppError('You do not have write permission for roles', 403));
  }
  next();
};

// GET: any user with read access to Roles or Settings can list/view roles
// POST/PUT/DELETE: only users with write access
router.get('/',       canRead,  roleController.getRoles);
router.post('/',      canWrite, roleController.createRole);
router.get('/:id',    canRead,  roleController.getRole);
router.put('/:id',    canWrite, roleController.updateRole);
router.delete('/:id', canWrite, roleController.deleteRole);

module.exports = router;
