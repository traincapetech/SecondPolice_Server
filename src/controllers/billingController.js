const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { sendEmail } = require('../utils/emailService');
const { generateInvoicePDF } = require('../utils/invoiceGenerator');

/**
 * Creates a Stripe Checkout Session for CRM Subscription
 */
exports.createCheckoutSession = async (req, res, next) => {
  try {
    const { priceId, planId, seatTierId, billingCycle } = req.body;
    const { tenantId, email, id: userId } = req.user;

    if (!priceId) return next(new AppError('Price ID is required', 400));

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { where: { role: 'ADMIN' } } }
    });

    let stripeCustomerId = tenant.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        name: tenant.name,
        metadata: { tenantId: tenant.id }
      });
      stripeCustomerId = customer.id;
      await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      allow_promotion_codes: true,
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing?canceled=true`,
      metadata: { tenantId, userId, planId, seatTierId, billingCycle },
      subscription_data: { metadata: { tenantId, planId, seatTierId, billingCycle } }
    });

    res.status(200).json({ status: 'success', url: session.url });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies a completed Stripe Checkout Session and activates the subscription.
 * Bypasses the need for webhook delivery on localhost.
 */
exports.verifySession = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const { tenantId } = req.user;

    if (!sessionId) return next(new AppError('Session ID is required', 400));

    // 1. Fetch session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return next(new AppError('Payment not completed yet.', 402));
    }

    // 2. Security: session must belong to this tenant
    if (session.metadata.tenantId !== tenantId) {
      return next(new AppError('Session does not belong to your account.', 403));
    }

    const subId = session.subscription;
    if (!subId) return next(new AppError('No subscription found in session.', 404));

    // 3. Fetch full subscription object separately (Most reliable way)
    const subscription = await stripe.subscriptions.retrieve(subId);

    const { planId, seatTierId, billingCycle } = session.metadata;

    // 4. Helper to parse dates safely
    const safeDate = (val) => {
      // Stripe timestamps are seconds. If it's already a string/date, handle it.
      const ts = typeof val === 'string' ? parseInt(val) : val;
      const d = ts ? new Date(ts * 1000) : new Date();
      return isNaN(d.getTime()) ? new Date() : d;
    };

    // 5. Fetch latest invoice for the download link
    const latestInvoice = subscription.latest_invoice 
      ? await stripe.invoices.retrieve(subscription.latest_invoice)
      : null;

    // 6. Upsert subscription in DB
    const sub = await prisma.tenantSubscription.upsert({
      where: { tenantId },
      update: {
        planId,
        seatTierId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0].price.id,
        stripeCustomerId: session.customer,
        status: 'ACTIVE',
        billingCycle: (billingCycle || 'MONTHLY').toUpperCase(),
        currentPeriodStart: safeDate(subscription.current_period_start),
        currentPeriodEnd: safeDate(subscription.current_period_end),
        cancelAtPeriodEnd: false,
        latestInvoiceUrl: latestInvoice?.hosted_invoice_url,
      },
      create: {
        tenantId,
        planId,
        seatTierId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.items.data[0].price.id,
        status: 'ACTIVE',
        billingCycle: (billingCycle || 'MONTHLY').toUpperCase(),
        currentPeriodStart: safeDate(subscription.current_period_start),
        currentPeriodEnd: safeDate(subscription.current_period_end),
        currency: (subscription.currency || 'inr').toUpperCase(),
        latestInvoiceUrl: latestInvoice?.hosted_invoice_url,
      },
      include: { plan: true, seatTier: true }
    });

    // 5. Update seat limit on Tenant
    if (seatTierId) {
      const tier = await prisma.seatTier.findUnique({ where: { id: seatTierId } });
      if (tier) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { subscriptionId: subscription.id, seatLimit: tier.maxSeats }
        });
      }
    }

    // 7. Send payment confirmation email with PDF invoice (non-blocking)
    try {
      const admin  = await prisma.user.findFirst({ where: { tenantId, role: 'ADMIN' } });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

      const toEmail     = admin?.email || '';
      const toName      = admin?.name  || tenant?.name || 'Admin';
      const planName    = sub.plan?.name || 'CRM Plan';
      const rawAmount   = subscription.items.data[0].plan.amount / 100; // paise → rupees
      const gstRate     = 0.18;
      // Stripe already charged GST-inclusive amount, so extract base
      const baseAmount  = parseFloat((rawAmount / (1 + gstRate)).toFixed(2));
      const periodEnd   = safeDate(subscription.current_period_end);
      const invoiceDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const nextBilling = periodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      // Sequential invoice number: SP-YYYY-NNNNN
      const invoiceCount = await prisma.tenantSubscription.count();
      const invoiceNo    = `SP-${new Date().getFullYear()}-${String(invoiceCount).padStart(5, '0')}`;

      // Generate PDF
      const pdfBase64 = await generateInvoicePDF({
        invoiceNumber:   invoiceNo,
        invoiceDate,
        companyName:     process.env.COMPANY_NAME    || 'Traincape Technology Pvt. Ltd.',
        companyAddress:  process.env.COMPANY_ADDRESS || 'India',
        companyGstin:    process.env.COMPANY_GSTIN   || 'N/A',
        companyPan:      process.env.COMPANY_PAN     || 'N/A',
        companySac:      '998313',
        customerName:    toName,
        customerEmail:   toEmail,
        planName,
        billingCycle:    billingCycle || 'MONTHLY',
        baseAmount,
        gstRate,
        stripeInvoiceId: latestInvoice?.id || subId,
        nextBillingDate: nextBilling,
        seats:           sub.seatTier?.maxSeats || 1,
      });

      const billingLabel = (billingCycle || 'MONTHLY') === 'YEARLY' ? 'Annual' : 'Monthly';
      const total = (rawAmount).toFixed(2);

      const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#2C3E50 0%,#3D9970 100%);padding:44px 44px 64px;border-radius:24px 24px 0 0;text-align:center">
            <h1 style="color:white;margin:0 0 6px;font-size:28px;font-weight:900;letter-spacing:-0.5px">SecondPolice</h1>
            <p style="color:rgba(255,255,255,0.7);margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase">Enterprise CRM · Tax Invoice</p>
          </div>

          <!-- Card -->
          <div style="background:white;padding:44px;margin-top:-24px;border-radius:24px;box-shadow:0 8px 40px rgba(0,0,0,0.07)">

            <!-- Success badge -->
            <div style="text-align:center;margin-bottom:36px">
              <div style="width:80px;height:80px;background:#dcfce7;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:38px;line-height:80px">✅</div>
              <h2 style="color:#1e293b;margin:0 0 8px;font-size:24px;font-weight:900">Payment Confirmed!</h2>
              <p style="color:#64748b;margin:0;font-size:15px">Hi <strong>${toName}</strong>, your <strong>${planName}</strong> plan is now active.</p>
            </div>

            <!-- Invoice summary -->
            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:18px;padding:28px;margin-bottom:28px">
              <p style="color:#2C3E50;margin:0 0 18px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Invoice Summary · ${invoiceNo}</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:9px 0;color:#64748b">Plan</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">${planName}</td></tr>
                <tr><td style="padding:9px 0;color:#64748b">Billing</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">${billingLabel}</td></tr>
                <tr><td style="padding:9px 0;color:#64748b">Base Amount</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">₹${baseAmount.toFixed(2)}</td></tr>
                <tr><td style="padding:9px 0;color:#64748b">CGST (9%)</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">₹${(baseAmount * 0.09).toFixed(2)}</td></tr>
                <tr><td style="padding:9px 0;color:#64748b">SGST (9%)</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">₹${(baseAmount * 0.09).toFixed(2)}</td></tr>
                <tr><td style="padding:9px 0;color:#64748b">SAC Code</td><td style="padding:9px 0;font-weight:800;text-align:right;color:#1e293b">998313</td></tr>
                <tr style="border-top:2px solid #e2e8f0">
                  <td style="padding:18px 0 6px;color:#1e293b;font-weight:900;font-size:17px">Total Paid</td>
                  <td style="padding:18px 0 6px;font-weight:900;text-align:right;color:#3D9970;font-size:22px">₹${total}</td>
                </tr>
              </table>
            </div>

            <!-- Next billing notice -->
            <div style="background:#f0fdf4;border-left:4px solid #3D9970;border-radius:10px;padding:16px 20px;margin-bottom:32px;font-size:13px;color:#166534">
              📅 <strong>Next billing date:</strong> ${nextBilling}. You can cancel or modify your plan anytime from the billing dashboard.
            </div>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:32px">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard"
                 style="display:inline-block;padding:18px 48px;background:linear-gradient(135deg,#3D9970,#2E7D5C);color:white;border-radius:14px;text-decoration:none;font-weight:900;font-size:16px;box-shadow:0 8px 20px rgba(61,153,112,0.3)">
                Open Dashboard →
              </a>
            </div>

            <!-- Attachment note -->
            <div style="background:#eff6ff;border-radius:10px;padding:14px 18px;font-size:12.5px;color:#1d4ed8;text-align:center">
              📎 Your <strong>GST-compliant tax invoice (${invoiceNo})</strong> is attached to this email as a PDF.
            </div>

            <p style="text-align:center;color:#94a3b8;font-size:11px;margin:24px 0 0">
              SecondPolice CRM · support@secondpolice.com<br/>
              This is a computer-generated receipt. No physical signature required.
            </p>
          </div>
        </div>`;

      if (toEmail) {
        await sendEmail(
          toEmail,
          toName,
          `🎉 Payment Confirmed — ${planName} Plan Active (Invoice ${invoiceNo})`,
          html,
          [{ name: `Invoice-${invoiceNo}.pdf`, content: pdfBase64 }]
        );
        console.log(`✅ Invoice email sent to ${toEmail} (Invoice ${invoiceNo})`);
      }
    } catch (emailErr) {
      console.error('⚠️ Invoice email failed (non-critical):', emailErr.message);
    }

    res.status(200).json({ status: 'success', data: sub });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a Stripe Customer Portal Session
 */
exports.createCustomerPortal = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant.stripeCustomerId) {
      return next(new AppError('No billing history found. Please subscribe to a plan first.', 404));
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/billing`,
    });

    res.status(200).json({ status: 'success', url: session.url });
  } catch (error) {
    next(error);
  }
};

/**
 * Gets current subscription details for the tenant
 */
exports.getSubscription = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true, seatTier: true }
    });
    res.status(200).json({ status: 'success', data: sub });
  } catch (error) {
    next(error);
  }
};
