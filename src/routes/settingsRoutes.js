const express = require('express');
const settingsController = require('../controllers/settingsController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/', settingsController.getSettings);
router.patch('/currency', settingsController.updateDisplayCurrency);
router.patch('/workspace', restrictTo('ADMIN'), settingsController.updateWorkspace);

module.exports = router;
