const prisma = require('../lib/prisma');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const { sendEmail } = require('../utils/emailService');

/**
 * Generates a sequential invoice number for the tenant.
 * Format: INV-YYYY-NNNN (e.g. INV-2026-0042)
 */
async function generateInvoiceNumber(tenantId) {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({ where: { tenantId } });
  const seq = String(count + 1).padStart(4, '0');
  return `INV-${year}-${seq}`;
}

/**
 * Auto-creates a DRAFT invoice when a Deal is moved to WON.
 * Pulls client info from the linked Lead or a fallback to the deal title.
 */
async function createInvoiceFromDeal(deal, tenant) {
  // Don't create if one already exists for this deal
  const existing = await prisma.invoice.findUnique({ where: { dealId: deal.id } });
  if (existing) return existing;

  // Try to get client details from the linked Lead
  let clientName = deal.title;
  let clientEmail = null;
  let clientPhone = null;
  let clientAddress = null;
  let clientCity = null;
  let clientState = null;
  let clientPinCode = null;
  let clientCountry = null;
  let clientGstin = null;

  if (deal.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: deal.leadId },
      select: { firstName: true, lastName: true, email: true, company: true, phone: true, address: true, city: true, state: true, pinCode: true, country: true, gstin: true },
    });
    if (lead) {
      clientName = `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}`;
      if (lead.company) clientName += ` (${lead.company})`;
      clientEmail = lead.email || null;
      clientPhone = lead.phone || null;
      clientAddress = lead.address || null;
      clientCity = lead.city || null;
      clientState = lead.state || null;
      clientPinCode = lead.pinCode || null;
      clientCountry = lead.country || null;
      clientGstin = lead.gstin || null;
    }
  }

  const taxRate    = tenant.taxRate || 0;
  const amount     = deal.value || 0;
  const taxAmount  = parseFloat(((amount * taxRate) / 100).toFixed(2));
  const totalAmount = parseFloat((amount + taxAmount).toFixed(2));

  // Due date: Net 30
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoiceNo = await generateInvoiceNumber(tenant.id);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId:    tenant.id,
      dealId:      deal.id,
      invoiceNo,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      clientCity,
      clientState,
      clientPinCode,
      clientCountry,
      clientGstin,
      amount,
      currency:    deal.currency || 'USD',
      taxRate,
      taxAmount,
      totalAmount,
      dueDate,
      status:      'DRAFT',
    },
  });

  return invoice;
}

/**
 * Generates the PDF and sends it via email.
 * Updates invoice status to SENT.
 * @param {string} invoiceId
 * @param {{ name: string, companyProfile: object }} tenant
 */
async function generateAndSendInvoice(invoiceId, tenant) {
  const tenantName = typeof tenant === 'string' ? tenant : (tenant?.name || 'Your Company');

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { deal: { select: { title: true } } },
  });

  if (!invoice) throw new Error('Invoice not found');
  if (!invoice.clientEmail) throw new Error('No client email on record. Please add one before sending.');

  const pdfBuffer = await generateInvoicePDF(invoice, tenant);
  const base64PDF = pdfBuffer.toString('base64');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1E293B;">
      <div style="background:#4338CA;padding:28px 32px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:22px;">${tenantName}</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Invoice ${invoice.invoiceNo}</p>
      </div>
      <div style="padding:28px 32px;background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;">
        <p style="margin:0 0 16px;">Hi <strong>${invoice.clientName}</strong>,</p>
        <p style="margin:0 0 16px;color:#475569;">Please find your invoice attached for <strong>${invoice.deal?.title || 'services rendered'}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#64748B;font-size:13px;">Invoice No.</td><td style="padding:8px 0;font-weight:600;text-align:right;">${invoice.invoiceNo}</td></tr>
          <tr><td style="padding:8px 0;color:#64748B;font-size:13px;">Amount Due</td><td style="padding:8px 0;font-weight:700;font-size:17px;text-align:right;color:#4338CA;">${new Intl.NumberFormat('en-IN',{style:'currency',currency:invoice.currency}).format(invoice.totalAmount)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748B;font-size:13px;">Due Date</td><td style="padding:8px 0;font-weight:600;text-align:right;">${new Date(invoice.dueDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td></tr>
        </table>
        <p style="margin:0;color:#64748B;font-size:12px;">The full invoice PDF is attached to this email. Please reach out if you have any questions.</p>
      </div>
      <div style="padding:16px 32px;background:#F1F5F9;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94A3B8;">Sent by ${tenantName} via Second Police CRM</p>
      </div>
    </div>
  `;

  await sendEmail(
    invoice.clientEmail,
    invoice.clientName,
    `Invoice ${invoice.invoiceNo} from ${tenantName}`,
    html,
    [{ name: `${invoice.invoiceNo}.pdf`, content: base64PDF }]
  );

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', sentAt: new Date() },
  });

  return updated;
}

module.exports = { createInvoiceFromDeal, generateAndSendInvoice };
