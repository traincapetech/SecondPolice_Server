const express = require('express');
const userController = require('../controllers/userController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// All user routes require auth
router.use(authenticate);

// Team list — All authenticated users can view their workspace members
router.get('/', userController.getTeamMembers);

// Add / Delete employee — ADMIN only
router.post('/', restrictTo('ADMIN'), userController.addEmployee);
router.delete('/:id', restrictTo('ADMIN'), userController.deleteEmployee);

// Self-service — any authenticated user
router.put('/me',          userController.updateMe);
router.put('/me/password', userController.changePassword);

module.exports = router;
