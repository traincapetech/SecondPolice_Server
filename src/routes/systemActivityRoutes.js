const express = require('express');
const systemActivityController = require('../controllers/systemActivityController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// Require authentication and ADMIN role for all routes in this module
router.use(authenticate);
router.use(restrictTo('ADMIN'));

router.get('/', systemActivityController.getActivities);

module.exports = router;
