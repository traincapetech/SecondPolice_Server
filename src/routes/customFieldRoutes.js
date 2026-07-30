const express = require('express');
const router = express.Router();

const customFieldController = require('../controllers/customFieldController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

// Every route requires authentication
router.use(authenticate);

// Any authenticated user can fetch custom field definitions
router.get('/:entityType', customFieldController.getCustomFields);

// Only SUPERADMIN / ADMIN can modify definitions
router.post(
  '/',
  restrictTo('SUPERADMIN', 'ADMIN'),
  customFieldController.createCustomField
);

router.put(
  '/:id',
  restrictTo('SUPERADMIN', 'ADMIN'),
  customFieldController.updateCustomField
);

router.delete(
  '/:id',
  restrictTo('SUPERADMIN', 'ADMIN'),
  customFieldController.deleteCustomField
);

module.exports = router;