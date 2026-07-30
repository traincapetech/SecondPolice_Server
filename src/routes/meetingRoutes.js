const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const meetingController = require('../controllers/meetingController');

const router = express.Router();

router.use(authenticate);

router.post('/', meetingController.createMeeting);
router.post('/join', meetingController.joinMeeting);
router.get('/recent', meetingController.getRecentMeetings);
router.get('/token', meetingController.getMeetingToken);
router.get('/invitations', meetingController.getPendingInvitations);
router.get('/:roomName', meetingController.getMeetingDetails);
router.post('/:roomName/end', meetingController.endMeeting);

module.exports = router;
