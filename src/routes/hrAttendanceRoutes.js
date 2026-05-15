const express = require('express');
const router = express.Router();
const hrAttendanceController = require('../controllers/hrAttendanceController');

router.get('/', hrAttendanceController.getAttendance);
router.post('/clock-in', hrAttendanceController.clockIn);
router.put('/clock-out', hrAttendanceController.clockOut);
router.get('/today', hrAttendanceController.getTodayStatus);

module.exports = router;
