const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authenticate } = require('../middlewares/authMiddleware');

// All billing routes require authentication
router.use(authenticate);

// 1. Initiate Stripe Checkout
router.post('/checkout', billingController.createCheckoutSession);

// 2. Verify completed session → activates subscription + sends email
router.post('/verify-session', billingController.verifySession);

// 3. Open Stripe Customer Portal (manage/cancel)
router.post('/portal', billingController.createCustomerPortal);

// 4. Get current subscription status
router.get('/subscription', billingController.getSubscription);

module.exports = router;
