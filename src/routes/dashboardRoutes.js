const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { getDashboardStats } = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);

module.exports = router;
