const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../lib/prisma');
const stripeWebhookService = require('../services/stripeWebhookService');

// Webhook endpoint must use raw body for signature verification
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    await stripeWebhookService.processEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error(`❌ Event Processing Error: ${err.message}`);
    res.status(500).send('Event Processing Error');
  }
});

module.exports = router;
