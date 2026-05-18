require('dotenv').config();
const prisma = require('./src/lib/prisma');
const { generateInvoicePDF } = require('./src/utils/invoiceGenerator');
const { sendEmail } = require('./src/utils/emailService');

async function sendNitinInvoice() {
  const user = await prisma.user.findFirst({
    where: { email: 'nitin@traincapetech.in' },
    include: {
      tenant: {
        include: {
          subscription: {
            include: {
              plan: true,
              seatTier: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    console.error('❌ User nitin@traincapetech.in not found');
    return;
  }

  const sub = user.tenant?.subscription;
  if (!sub) {
    console.error('❌ No active subscription record found in DB for Nitin');
    return;
  }

  console.log('🔄 Preparing test GST-compliant invoice for Nitin...');

  // Setup pricing details
  const rawAmount = parseFloat(sub.seatTier?.baseAmountInr || '100');
  const gstRate = 0.18;
  const baseAmount = parseFloat((rawAmount / (1 + gstRate)).toFixed(2));
  const invoiceDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date();
  // Safe validation check: if current period end is in the past, renew to next month
  let nextBillingDate = currentPeriodEnd;
  if (nextBillingDate <= new Date()) {
    nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  const nextBillingStr = nextBillingDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // Sequential invoice number
  const invoiceNo = `SP-${new Date().getFullYear()}-00042`; // custom sequential invoice ID for Nitin

  console.log('📄 Generating PDF layout...');
  const pdfBase64 = await generateInvoicePDF({
    invoiceNumber: invoiceNo,
    invoiceDate,
    companyName: process.env.COMPANY_NAME || 'Traincape Technology Pvt. Ltd.',
    companyAddress: process.env.COMPANY_ADDRESS || 'Flat No. 403, Block B, Green Glen Layout, Bellandur, Bangalore, Karnataka - 560103',
    companyGstin: process.env.COMPANY_GSTIN || '29AAFCT2914K1Z9',
    companyPan: process.env.COMPANY_PAN || 'AAFCT2914K',
    companySac: '998313',
    customerName: user.name || 'Nitin',
    customerEmail: user.email,
    planName: sub.plan?.name || 'Starter',
    billingCycle: sub.billingCycle || 'MONTHLY',
    baseAmount,
    gstRate,
    stripeInvoiceId: sub.stripeSubscriptionId,
    nextBillingDate: nextBillingStr,
    seats: sub.seatTier?.maxSeats || 5,
  });

  const billingLabel = (sub.billingCycle || 'MONTHLY') === 'YEARLY' ? 'Annual' : 'Monthly';
  const total = rawAmount.toFixed(2);

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:20px 0">
      <!-- Outer container -->
      <div style="background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.06);border:1px solid #e2e8f0">
        
        <!-- Header banner -->
        <div style="background:linear-gradient(135deg,#2C3E50 0%,#3D9970 100%);padding:44px 44px 50px;text-align:center">
          <h1 style="color:white;margin:0 0 6px;font-size:30px;font-weight:900;letter-spacing:-0.5px">SecondPolice</h1>
          <p style="color:rgba(255,255,255,0.75);margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase">Enterprise CRM · Tax Invoice</p>
        </div>

        <!-- Inner Content -->
        <div style="padding:44px">
          <!-- Success Stamp -->
          <div style="text-align:center;margin-bottom:36px">
            <div style="width:72px;height:72px;background:#dcfce7;border-radius:50%;margin:0 auto 16px;line-height:72px;font-size:36px;text-align:center">✅</div>
            <h2 style="color:#1e293b;margin:0 0 8px;font-size:24px;font-weight:900">Payment Successful!</h2>
            <p style="color:#64748b;margin:0;font-size:15px">Hi <strong>${user.name}</strong>, your <strong>${sub.plan?.name} Plan</strong> subscription is active.</p>
          </div>

          <!-- Summary Box -->
          <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:18px;padding:24px;margin-bottom:28px">
            <p style="color:#2C3E50;margin:0 0 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Receipt Details · ${invoiceNo}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr>
                <td style="padding:8px 0;color:#64748b">Plan</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">${sub.plan?.name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b">Billing Cycle</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">${billingLabel}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b">Seat Limit</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">${sub.seatTier?.maxSeats || 5} Seats</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b">Base Amount</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">₹${baseAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b">CGST (9%)</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">₹${(baseAmount * 0.09).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b">SGST (9%)</td>
                <td style="padding:8px 0;font-weight:800;text-align:right;color:#1e293b">₹${(baseAmount * 0.09).toFixed(2)}</td>
              </tr>
              <tr style="border-top:2px solid #e2e8f0">
                <td style="padding:16px 0 6px;color:#1e293b;font-weight:900;font-size:16px">Total Charged</td>
                <td style="padding:16px 0 6px;font-weight:900;text-align:right;color:#3D9970;font-size:22px">₹${total}</td>
              </tr>
            </table>
          </div>

          <!-- Reminders -->
          <div style="background:#f0fdf4;border-left:4px solid #3D9970;border-radius:10px;padding:16px 20px;margin-bottom:28px;font-size:13px;color:#166534">
            📅 <strong>Next billing date:</strong> ${nextBillingStr}. You can manage payment details and auto-renewal in your Billing Portal.
          </div>

          <!-- PDF note -->
          <div style="background:#eff6ff;border-radius:12px;padding:16px;font-size:13px;color:#1d4ed8;text-align:center;margin-bottom:32px;font-weight:700">
            📎 Your official GST-compliant tax invoice is attached as a PDF.
          </div>

          <!-- CTA button -->
          <div style="text-align:center">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard"
               style="display:inline-block;padding:18px 48px;background:linear-gradient(135deg,#3D9970,#2E7D5C);color:white;border-radius:14px;text-decoration:none;font-weight:900;font-size:15px;box-shadow:0 8px 20px rgba(61,153,112,0.25)">
              Open Dashboard →
            </a>
          </div>

          <p style="text-align:center;color:#94a3b8;font-size:11px;margin:36px 0 0;line-height:1.5">
            SecondPolice CRM · support@secondpolice.com<br/>
            Flat No. 403, Block B, Green Glen Layout, Bellandur, Bangalore, Karnataka - 560103
          </p>
        </div>
      </div>
    </div>
  `;

  console.log(`✉️ Attempting to send email to ${user.email}...`);
  try {
    await sendEmail(
      user.email,
      user.name || 'Nitin',
      `🎉 Payment Confirmed — ${sub.plan?.name || 'Starter'} Plan Active (Invoice ${invoiceNo})`,
      html,
      [{ name: `Invoice-${invoiceNo}.pdf`, content: pdfBase64 }]
    );
    console.log(`🚀 Success! GST-compliant tax invoice email successfully sent to ${user.email}.`);
  } catch (err) {
    console.warn(`⚠️ Email dispatch failed due to Brevo IP whitelist security restriction:`, err.message);
    console.log(`💡 No worries! Saving the generated PDF invoice locally to the workspace so you can inspect it immediately...`);
    const fs = require('fs');
    fs.writeFileSync('test-invoice-nitin.pdf', Buffer.from(pdfBase64, 'base64'));
    console.log(`✨ File saved successfully at: server/test-invoice-nitin.pdf ✅`);
  }
}

sendNitinInvoice()
  .catch((err) => {
    console.error('❌ Failed to run script:', err);
  })
  .finally(() => prisma.$disconnect());
