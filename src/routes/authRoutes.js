const express = require('express');
const authController = require('../controllers/authController');

const { authenticate } = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Apply strict rate limiting to sensitive endpoints
router.post('/register-tenant', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/verify-otp', authLimiter, authenticate, authController.verifyOTP);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Resend OTP — authenticated (email verify) OR unauthenticated (forgot-password)
router.post('/resend-otp', authLimiter, (req, res, next) => {
  // Try to authenticate; if token missing/invalid just continue without req.user
  authenticate(req, res, (err) => next());
}, authController.resendOTP);

router.get('/me', authenticate, authController.getMe);

module.exports = router;
