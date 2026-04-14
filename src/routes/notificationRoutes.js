const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/',                      notificationController.getNotifications);
router.patch('/read-all',            notificationController.markAllRead);
router.patch('/:id/read',            notificationController.markRead);
router.delete('/',                   notificationController.clearAll);

module.exports = router;
