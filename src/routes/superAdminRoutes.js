const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

// All routes here are restricted to SUPERADMIN
router.use(authenticate, restrictTo('SUPERADMIN'));

// 0. Dashboard Stats for the Owner
router.get('/stats', superAdminController.getDashboardStats);

// 1. Company Configuration
router.get('/config', superAdminController.getCompanyConfig);
router.patch('/config', superAdminController.updateConfig);

// 2. Tax Configuration
router.get('/tax', superAdminController.getTaxConfigs);

// 3. Plan Management
router.patch('/plans/:id', superAdminController.updatePlan);

module.exports = router;
