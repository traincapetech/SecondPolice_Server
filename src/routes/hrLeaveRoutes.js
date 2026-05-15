const express = require('express');
const router = express.Router();
const hrLeaveController = require('../controllers/hrLeaveController');

router.get('/', hrLeaveController.getLeaves);
router.post('/', hrLeaveController.applyLeave);
router.put('/:id/status', hrLeaveController.updateLeaveStatus);

module.exports = router;
