const PDFDocument = require('pdfkit');

/**
 * Generates a GST-compliant PDF invoice and returns it as a base64 string.
 *
 * @param {Object} opts
 * @param {string} opts.invoiceNumber     - e.g. "SP-2024-00042"
 * @param {string} opts.invoiceDate       - e.g. "16 May 2026"
 * @param {string} opts.companyName       - Seller: "Traincape Technology Pvt. Ltd."
 * @param {string} opts.companyAddress    - Seller address (multi-line)
 * @param {string} opts.companyGstin      - Seller GSTIN
 * @param {string} opts.companyPan        - Seller PAN
 * @param {string} opts.companySac        - SAC code, default 998313
 * @param {string} opts.customerName      - Buyer name
 * @param {string} opts.customerEmail     - Buyer email
 * @param {string} opts.planName          - e.g. "Starter"
 * @param {string} opts.billingCycle      - "MONTHLY" | "YEARLY"
 * @param {number} opts.baseAmount        - Amount before tax (in INR)
 * @param {number} opts.gstRate           - e.g. 0.18
 * @param {string} opts.stripeInvoiceId   - Stripe invoice ID for reference
 * @param {string} opts.nextBillingDate   - e.g. "16 June 2026"
 * @param {number} opts.seats             - Number of seats
 * @returns {Promise<string>} base64-encoded PDF
 */
const generateInvoicePDF = (opts) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers).toString('base64')));
    doc.on('error', reject);

    // ── Calculated values ──────────────────────────────────────────────────
    const gstRate    = opts.gstRate ?? 0.18;
    const base       = Number(opts.baseAmount) || 0;
    const gstAmt     = parseFloat((base * gstRate).toFixed(2));
    const total      = parseFloat((base + gstAmt).toFixed(2));
    const cgst       = parseFloat((gstAmt / 2).toFixed(2));
    const sgst       = parseFloat((gstAmt / 2).toFixed(2));
    const currency   = '₹';

    // ── Brand colours ──────────────────────────────────────────────────────
    const GREEN  = '#3D9970';
    const DARK   = '#2C3E50';
    const LIGHT  = '#F8FAFC';
    const GREY   = '#64748B';
    const BLACK  = '#1E293B';

    // ══════════════════════════════════════════════════════════════════════
    // HEADER BAND
    // ══════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, doc.page.width, 120).fill(DARK);

    // Company name
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
       .text('SecondPolice', 50, 30);
    doc.fillColor('rgba(255,255,255,0.65)').fontSize(9).font('Helvetica')
       .text('Next-Gen Enterprise CRM', 50, 57);

    // TAX INVOICE label (top-right)
    doc.fillColor(GREEN).fontSize(18).font('Helvetica-Bold')
       .text('TAX INVOICE', 0, 35, { align: 'right', width: doc.page.width - 50 });
    doc.fillColor('rgba(255,255,255,0.65)').fontSize(8).font('Helvetica')
       .text('GST Compliant · SAC ' + (opts.companySac || '998313'), 0, 60,
             { align: 'right', width: doc.page.width - 50 });

    // ══════════════════════════════════════════════════════════════════════
    // META ROW  (Invoice No / Date / Status)
    // ══════════════════════════════════════════════════════════════════════
    const metaY = 135;
    const colW  = (doc.page.width - 100) / 3;

    [
      { label: 'Invoice Number', value: opts.invoiceNumber },
      { label: 'Invoice Date',   value: opts.invoiceDate },
      { label: 'Status',         value: 'PAID ✓' },
    ].forEach((item, i) => {
      const x = 50 + i * colW;
      doc.fillColor(GREY).fontSize(7).font('Helvetica').text(item.label.toUpperCase(), x, metaY);
      doc.fillColor(i === 2 ? GREEN : BLACK).fontSize(11).font('Helvetica-Bold')
         .text(item.value, x, metaY + 12, { width: colW - 10 });
    });

    // divider
    doc.moveTo(50, metaY + 40).lineTo(doc.page.width - 50, metaY + 40)
       .strokeColor('#E2E8F0').lineWidth(1).stroke();

    // ══════════════════════════════════════════════════════════════════════
    // SELLER  ↔  BUYER
    // ══════════════════════════════════════════════════════════════════════
    const partyY  = metaY + 55;
    const halfW   = (doc.page.width - 100) / 2 - 10;

    // Seller box
    doc.rect(50, partyY, halfW, 110).fill(LIGHT);
    doc.fillColor(GREEN).fontSize(7).font('Helvetica-Bold')
       .text('SELLER (SUPPLIER)', 60, partyY + 10);
    doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold')
       .text(opts.companyName || 'Traincape Technology Pvt. Ltd.', 60, partyY + 24, { width: halfW - 20 });
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
       .text(opts.companyAddress || 'India', 60, partyY + 40, { width: halfW - 20 });
    doc.fillColor(GREY).fontSize(8)
       .text(`GSTIN: ${opts.companyGstin || 'N/A'}`, 60, partyY + 80)
       .text(`PAN:   ${opts.companyPan   || 'N/A'}`, 60, partyY + 93);

    // Buyer box
    const buyerX = 50 + halfW + 20;
    doc.rect(buyerX, partyY, halfW, 110).fill(LIGHT);
    doc.fillColor(GREEN).fontSize(7).font('Helvetica-Bold')
       .text('BILLED TO (BUYER)', buyerX + 10, partyY + 10);
    doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold')
       .text(opts.customerName, buyerX + 10, partyY + 24, { width: halfW - 20 });
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
       .text(opts.customerEmail, buyerX + 10, partyY + 40)
       .text('Category: Software Subscription (B2B)', buyerX + 10, partyY + 55)
       .text('Place of Supply: India', buyerX + 10, partyY + 68);

    // ══════════════════════════════════════════════════════════════════════
    // LINE ITEMS TABLE
    // ══════════════════════════════════════════════════════════════════════
    const tableY = partyY + 130;

    // Header row
    doc.rect(50, tableY, doc.page.width - 100, 24).fill(DARK);
    const cols = [
      { label: '#',           x: 55,  w: 25  },
      { label: 'Description', x: 85,  w: 200 },
      { label: 'SAC',         x: 290, w: 55  },
      { label: 'Seats',       x: 350, w: 45  },
      { label: 'Cycle',       x: 400, w: 60  },
      { label: 'Base (₹)',    x: 465, w: 65  },
    ];
    cols.forEach(c => {
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text(c.label, c.x, tableY + 8, { width: c.w });
    });

    // Data row
    const rowY = tableY + 28;
    doc.rect(50, rowY, doc.page.width - 100, 28).fill('#FFFFFF');
    const billingLabel = (opts.billingCycle || 'MONTHLY') === 'YEARLY' ? 'Annual' : 'Monthly';

    const rowData = [
      { text: '1',                           x: 55,  w: 25  },
      { text: `${opts.planName} CRM Plan`,   x: 85,  w: 200 },
      { text: opts.companySac || '998313',   x: 290, w: 55  },
      { text: String(opts.seats || 1),       x: 350, w: 45  },
      { text: billingLabel,                  x: 400, w: 60  },
      { text: `${currency}${base.toFixed(2)}`, x: 465, w: 65 },
    ];
    rowData.forEach(d => {
      doc.fillColor(BLACK).fontSize(9).font('Helvetica')
         .text(d.text, d.x, rowY + 9, { width: d.w });
    });

    // Alternating light row separator
    doc.moveTo(50, rowY + 28).lineTo(doc.page.width - 50, rowY + 28)
       .strokeColor('#E2E8F0').lineWidth(0.5).stroke();

    // ══════════════════════════════════════════════════════════════════════
    // TAX BREAKDOWN + TOTALS
    // ══════════════════════════════════════════════════════════════════════
    const totY    = rowY + 42;
    const labelX  = 340;
    const valX    = doc.page.width - 130;

    const totRows = [
      { label: 'Subtotal (before tax)',  value: `${currency}${base.toFixed(2)}`,  bold: false },
      { label: `CGST @ ${(gstRate / 2 * 100).toFixed(0)}%`, value: `${currency}${cgst.toFixed(2)}`, bold: false },
      { label: `SGST @ ${(gstRate / 2 * 100).toFixed(0)}%`, value: `${currency}${sgst.toFixed(2)}`, bold: false },
    ];

    totRows.forEach((row, i) => {
      const y = totY + i * 18;
      doc.fillColor(GREY).fontSize(9).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(row.label, labelX, y, { width: valX - labelX - 5, align: 'right' });
      doc.fillColor(BLACK).fontSize(9).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(row.value, valX, y, { width: 90, align: 'right' });
    });

    // Grand total band
    const gtY = totY + totRows.length * 18 + 8;
    doc.rect(50, gtY, doc.page.width - 100, 34).fill(GREEN);
    doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
       .text('TOTAL AMOUNT PAID', 60, gtY + 10)
       .text(`${currency}${total.toFixed(2)}`, valX - 50, gtY + 10,
             { width: 130, align: 'right' });

    // ══════════════════════════════════════════════════════════════════════
    // PAYMENT REFERENCE & NEXT BILLING
    // ══════════════════════════════════════════════════════════════════════
    const refY = gtY + 50;
    doc.rect(50, refY, doc.page.width - 100, 55).fill(LIGHT);
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
       .text(`Stripe Invoice Ref: ${opts.stripeInvoiceId || 'N/A'}`, 60, refY + 10)
       .text(`Next Billing Date: ${opts.nextBillingDate}`, 60, refY + 25)
       .text('Payment Method: Credit / Debit Card (via Stripe)', 60, refY + 40);

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    const footY = doc.page.height - 70;
    doc.moveTo(50, footY).lineTo(doc.page.width - 50, footY)
       .strokeColor('#E2E8F0').lineWidth(1).stroke();

    doc.fillColor(GREY).fontSize(7.5).font('Helvetica')
       .text('This is a computer-generated invoice and does not require a physical signature.', 50, footY + 10, { align: 'center', width: doc.page.width - 100 })
       .text('SecondPolice CRM · support@secondpolice.com · www.secondpolice.com', 50, footY + 24, { align: 'center', width: doc.page.width - 100 })
       .text(`GST-compliant Tax Invoice issued under Section 31 of the CGST Act, 2017. SAC Code: ${opts.companySac || '998313'} – Cloud-based ERP/CRM Software.`, 50, footY + 38, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  });
};

module.exports = { generateInvoicePDF };
