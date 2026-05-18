const prisma = require('../lib/prisma');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');
const creditService = require('./standaloneCreditService');

/**
 * Handles all incoming Stripe webhook events
 */
exports.processEvent = async (event) => {
  const data = event.data.object;

  console.log(`🔔 Stripe Webhook Received: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(data);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaid(data);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(data);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(data);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }
};

/**
 * Activation of Subscription after Checkout
 */
async function handleCheckoutCompleted(session) {
  const { tenantId, planId, seatTierId, billingCycle } = session.metadata;

  if (!tenantId) return;

  // Retrieve subscription details from Stripe to get period dates
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Upsert Subscription in DB
  await prisma.tenantSubscription.upsert({
    where: { tenantId },
    update: {
      planId,
      seatTierId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0].price.id,
      status: 'ACTIVE',
      billingCycle: billingCycle.toUpperCase(),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      seatsUsed: await prisma.user.count({ where: { tenantId } })
    },
    create: {
      tenantId,
      planId,
      seatTierId,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0].price.id,
      status: 'ACTIVE',
      billingCycle: billingCycle.toUpperCase(),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      currency: subscription.currency.toUpperCase()
    }
  });

  // 3. Apply credits from standalone tools if any
  await creditService.applyRemainingToolCredits(tenantId, session.customer);

  // Update Tenant's Seat Limit based on Tier
  const tier = await prisma.seatTier.findUnique({ where: { id: seatTierId } });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { 
      subscriptionId: subscription.id,
      seatLimit: tier.maxSeats 
    }
  });

  console.log(`✅ Subscription Activated for Tenant: ${tenantId}`);
}

/**
 * Recurring Payment / One-time Invoice Payment
 * This is where we generate the Tax Invoice PDF and Email it.
 */
async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return; // Ignore non-subscription invoices for now

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const tenantId = subscription.metadata.tenantId;

  if (!tenantId) return;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  // 1. Create a local Invoice record for bookkeeping
  const localInvoice = await prisma.invoice.create({
    data: {
      tenantId,
      dealId: `SUB-${invoice.id}`, // Pseudo deal ID for subscriptions
      invoiceNo: invoice.number || `INV-${Date.now()}`,
      clientName: tenant.name,
      amount: invoice.subtotal / 100,
      taxAmount: (invoice.tax || 0) / 100,
      totalAmount: invoice.total / 100,
      currency: invoice.currency.toUpperCase(),
      status: 'PAID',
      dueDate: new Date(),
      paidAt: new Date(),
      sacCode: '998313', // As requested
      subtotalAmount: invoice.subtotal / 100,
      notes: `Subscription payment for ${tenant.name}`
    }
  });

  // 2. Log Billing Event
  await prisma.billingEvent.create({
    data: {
      tenantId,
      type: 'PAYMENT_SUCCESS',
      amountInr: invoice.currency === 'inr' ? (invoice.total / 100) : null,
      amountUsd: invoice.currency === 'usd' ? (invoice.total / 100) : null,
      currency: invoice.currency.toUpperCase(),
      stripeEventId: invoice.id,
      stripeInvoiceId: invoice.id,
      metadata: { stripeInvoiceUrl: invoice.hosted_invoice_url }
    }
  });

  // 3. Generate PDF and Email (TODO: Implement PDF attachment in emailService)
  console.log(`📑 Invoice ${localInvoice.invoiceNo} generated for ${tenant.name}`);
  // try {
  //   const pdfPath = await generateInvoicePDF(localInvoice);
  //   await emailService.sendInvoiceEmail(tenant.companyProfile.companyEmail, pdfPath);
  // } catch (e) { console.error('Failed to send invoice email:', e.message); }
}

async function handleSubscriptionDeleted(subscription) {
  const tenantId = subscription.metadata.tenantId;
  if (!tenantId) return;

  await prisma.tenantSubscription.update({
    where: { tenantId },
    data: { status: 'CANCELLED' }
  });
  console.log(`❌ Subscription Cancelled for Tenant: ${tenantId}`);
}

async function handleSubscriptionUpdated(subscription) {
  const tenantId = subscription.metadata.tenantId;
  if (!tenantId) return;

  await prisma.tenantSubscription.update({
    where: { tenantId },
    data: {
      status: subscription.status.toUpperCase(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    }
  });
}
