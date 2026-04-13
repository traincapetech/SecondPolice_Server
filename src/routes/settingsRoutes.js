const express = require('express');
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/', settingsController.getSettings);
router.patch('/currency', settingsController.updateDisplayCurrency);

module.exports = router;
