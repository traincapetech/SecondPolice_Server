const prisma = require('../lib/prisma');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const { generateInvoicePDF: generateSubscriptionPDF } = require('../utils/invoiceGenerator');
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

  // 3. Generate PDF and Email (GST-compliant subscription invoice)
  console.log(`📑 Invoice ${localInvoice.invoiceNo} generated for ${tenant.name}`);
  try {
    const admin = await prisma.user.findFirst({
      where: { tenantId, role: 'ADMIN' }
    });
    const toEmail = admin?.email || tenant.companyProfile?.companyEmail || '';
    const toName = admin?.name || tenant.name || 'Subscriber';

    if (toEmail) {
      const sub = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        include: { plan: true, seatTier: true }
      });

      if (sub && sub.plan) {
        const pdfBuffer = await generateSubscriptionPDF(sub, tenant);
        const base64PDF = pdfBuffer.toString('base64');
        
        const subject = `Tax Invoice & Payment Confirmation: ${sub.plan.name} Plan`;
        const htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; padding: 12px; background-color: #ecfdf5; border-radius: 16px; margin-bottom: 8px;">
                <span style="font-size: 32px;">🎉</span>
              </div>
              <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800;">Subscription Payment Confirmed!</h2>
              <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Thank you for your payment.</p>
            </div>
            
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <h4 style="color: #475569; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Order Details</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Plan Name</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-align: right;">${sub.plan.name}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Billing Cycle</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-align: right; text-transform: capitalize;">${sub.billingCycle.toLowerCase()}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Amount Paid</td>
                  <td style="padding: 6px 0; color: #10b981; font-weight: bold; text-align: right;">
                    ${sub.currency === 'INR' ? '₹' : '$'}${localInvoice.totalAmount.toFixed(2)}
                  </td>
                </tr>
              </table>
            </div>
            
            <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
              We have automatically generated your GST-compliant tax invoice for this transaction. You will find it attached as a PDF to this email for your accounts and bookkeeping.
            </p>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                Sent automatically by Second Police CRM. If you have any billing queries, please contact support.
              </p>
            </div>
          </div>
        `;

        await emailService.sendEmail(
          toEmail,
          toName,
          subject,
          htmlContent,
          [{ name: `invoice-${localInvoice.invoiceNo}.pdf`, content: base64PDF }]
        );
        console.log(`✉️ Subscription invoice emailed successfully to ${toEmail}`);
      }
    }
  } catch (e) {
    console.error('Failed to send invoice email from webhook:', e.message);
  }
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
