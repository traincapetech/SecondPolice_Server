const express = require('express');
const reportsController = require('../controllers/reportsController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/overview', reportsController.getOverview);

module.exports = router;
