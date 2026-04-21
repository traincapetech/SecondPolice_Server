const PDFDocument = require('pdfkit');

/**
 * generateInvoicePDF(invoice, tenant)
 * tenant = { name, companyProfile: { businessCategory, address, city, state,
 *             pinCode, country, gstin, pan, companyEmail, companyPhone, logoUrl } }
 */
function generateInvoicePDF(invoice, tenant) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Tenant info ─────────────────────────────────────────────────────────
    const companyName = (typeof tenant === 'string' ? tenant : tenant?.name) || 'Your Company';
    const cp = (tenant && typeof tenant === 'object' && tenant.companyProfile)
      ? tenant.companyProfile
      : {};

    // ── Design tokens ───────────────────────────────────────────────────────
    const INDIGO  = '#4338CA';
    const SLATE   = '#1E293B';
    const MUTED   = '#64748B';
    const BORDER  = '#E2E8F0';
    const FROM_BG = '#EEF2FF';   // very light indigo
    const TO_BG   = '#EFF6FF';   // very light blue
    const WHITE   = '#FFFFFF';

    const PW  = doc.page.width;   // 595
    const PAD = 48;               // outer horizontal padding
    const CW  = PW - PAD * 2;    // 499

    const fmt = (n) =>
      new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    const fmtDate = (d) =>
      new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' });

    // ── 1. HEADER  ──────────────────────────────────────────────────────────
    let y = 40;

    // "GST Invoice"
    doc.fontSize(24).fillColor(SLATE).font('Helvetica-Bold')
       .text('GST Invoice', PAD, y);

    // Invoice meta (left column, below title)
    y += 32;
    const metaLabel = (label, value, row) => {
      const ry = y + row * 16;
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
         .text(label, PAD, ry, { continued: false });
      doc.fontSize(8.5).fillColor(SLATE).font('Helvetica-Bold')
         .text(value, PAD + 70, ry);
    };
    metaLabel('Invoice No:',   invoice.invoiceNo,          0);
    metaLabel('Invoice Date:', fmtDate(invoice.createdAt), 1);
    metaLabel('Due Date:',     fmtDate(invoice.dueDate),   2);

    // Status pill (top right)
    const statusColors = {
      DRAFT: '#64748B', SENT: '#3B82F6', PAID: '#10B981',
      OVERDUE: '#EF4444', CANCELLED: '#94A3B8',
    };
    const pillColor = statusColors[invoice.status] || '#64748B';
    const pillW = 72, pillH = 22;
    const pillX = PW - PAD - pillW;
    doc.roundedRect(pillX, 40, pillW, pillH, 11).fill(pillColor);
    doc.fontSize(8).fillColor(WHITE).font('Helvetica-Bold')
       .text(invoice.status, pillX, 47, { width: pillW, align: 'center' });

    // Company logo area (top right, below pill)
    const logoBoxW = 100, logoBoxH = 44;
    const logoBoxX = PW - PAD - logoBoxW;
    const logoBoxY = 40 + pillH + 8;
    doc.rect(logoBoxX, logoBoxY, logoBoxW, logoBoxH)
       .lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text(companyName, logoBoxX + 4, logoBoxY + 16, { width: logoBoxW - 8, align: 'center' });

    // Thin divider below header
    y = 130;
    doc.moveTo(PAD, y).lineTo(PW - PAD, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 18;

    // ── 2. FROM / BILLED TO boxes ───────────────────────────────────────────
    const BOX_W  = CW * 0.46;
    const BOX_X1 = PAD;
    const BOX_X2 = PAD + CW - BOX_W;
    const BOX_IP = 12;    // inner padding
    const BOX_Y  = y;

    // Measure FROM content height
    const fromAddress  = [cp.address].filter(Boolean);
    const fromCityLine = [cp.city, cp.state].filter(Boolean).join(', ');
    if (fromCityLine) fromAddress.push(fromCityLine);
    if (cp.pinCode)   fromAddress.push(cp.pinCode);
    if (cp.country)   fromAddress.push(cp.country);

    const fromExtras = [
      cp.gstin        ? `GSTIN: ${cp.gstin}`         : null,
      cp.pan          ? `PAN: ${cp.pan}`              : null,
      cp.companyEmail ? `Email: ${cp.companyEmail}`   : null,
      cp.companyPhone ? `Phone: ${cp.companyPhone}`   : null,
    ].filter(Boolean);

    // Calculate box height dynamically
    const fromRows  = 2 + fromAddress.length + (cp.businessCategory ? 1 : 0) + (fromExtras.length > 0 ? 1 : 0) + fromExtras.length;
    const BOX_H     = Math.max(140, BOX_IP + fromRows * 13 + BOX_IP);

    // ── FROM box ──
    doc.rect(BOX_X1, BOX_Y, BOX_W, BOX_H).fill(FROM_BG);

    let fy = BOX_Y + BOX_IP;

    // Company name
    doc.fontSize(10.5).fillColor(INDIGO).font('Helvetica-Bold')
       .text(companyName, BOX_X1 + BOX_IP, fy, { width: BOX_W - BOX_IP * 2 });
    fy += 15;

    // Business category
    if (cp.businessCategory) {
      doc.fontSize(8.5).fillColor(INDIGO).font('Helvetica')
         .text(cp.businessCategory, BOX_X1 + BOX_IP, fy, { width: BOX_W - BOX_IP * 2 });
      fy += 13;
    }
    fy += 5; // small gap before address

    // Address lines — explicitly set MUTED before each line to prevent color leakage
    fromAddress.forEach(line => {
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
         .text(line, BOX_X1 + BOX_IP, fy, { width: BOX_W - BOX_IP * 2 });
      fy += 12;
    });

    if (fromExtras.length > 0) fy += 5;

    // GSTIN / PAN / Email / Phone
    fromExtras.forEach(line => {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica')
         .text(line, BOX_X1 + BOX_IP, fy, { width: BOX_W - BOX_IP * 2 });
      fy += 12;
    });

    // ── BILLED TO box ──
    doc.rect(BOX_X2, BOX_Y, BOX_W, BOX_H).fill(TO_BG);

    let by = BOX_Y + BOX_IP;

    doc.fontSize(10.5).fillColor(INDIGO).font('Helvetica-Bold')
       .text('Billed To', BOX_X2 + BOX_IP, by, { width: BOX_W - BOX_IP * 2 });
    by += 16;

    doc.fontSize(10).fillColor(SLATE).font('Helvetica-Bold')
       .text(invoice.clientName || '—', BOX_X2 + BOX_IP, by, { width: BOX_W - BOX_IP * 2 });
    by += 14;

    // Client address fields (if available in the future)
    const billLines = [
      invoice.clientAddress,
      invoice.clientCity && invoice.clientState
        ? `${invoice.clientCity}, ${invoice.clientState}`
        : (invoice.clientCity || invoice.clientState || null),
      invoice.clientPinCode,
      invoice.clientCountry,
    ].filter(Boolean);

    billLines.forEach(line => {
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
         .text(line, BOX_X2 + BOX_IP, by, { width: BOX_W - BOX_IP * 2 });
      by += 12;
    });

    if (billLines.length > 0) by += 4;

    if (invoice.clientEmail) {
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
         .text(`Email: ${invoice.clientEmail}`, BOX_X2 + BOX_IP, by, { width: BOX_W - BOX_IP * 2 });
      by += 12;
    }
    if (invoice.clientPhone) {
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
         .text(`Phone: ${invoice.clientPhone}`, BOX_X2 + BOX_IP, by, { width: BOX_W - BOX_IP * 2 });
    }

    // ── 3. LINE ITEMS TABLE ─────────────────────────────────────────────────
    y = BOX_Y + BOX_H + 22;  // dynamic — always just below boxes

    // Column x positions
    const C_DESC  = PAD;
    const C_UP    = PAD + CW * 0.46;
    const C_GST   = PAD + CW * 0.60;
    const C_QTY   = PAD + CW * 0.72;
    const C_TOTAL = PAD + CW * 0.83;
    const C_END   = PAD + CW;

    // Header row
    const TH = 26;
    doc.rect(PAD, y, CW, TH).fill('#F8FAFC');
    doc.moveTo(PAD, y).lineTo(C_END, y).strokeColor(BORDER).lineWidth(0.75).stroke();
    doc.moveTo(PAD, y + TH).lineTo(C_END, y + TH).stroke();

    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold');
    const hY = y + 9;
    doc.text('DESCRIPTION', C_DESC + 8, hY)
       .text('UNIT PRICE',  C_UP,         hY, { width: C_GST - C_UP - 4, align: 'right' })
       .text('GST',         C_GST,        hY, { width: C_QTY - C_GST - 4, align: 'right' })
       .text('QTY',         C_QTY,        hY, { width: C_TOTAL - C_QTY - 4, align: 'right' })
       .text('TOTAL',       C_TOTAL,      hY, { width: C_END - C_TOTAL - 4, align: 'right' });

    y += TH;

    // Resolve line items
    let lineItems = [];
    if (invoice.lineItems && Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0) {
      lineItems = invoice.lineItems;
    } else {
      const unitPrice = invoice.amount || 0;
      const taxRate   = invoice.taxRate || 0;
      const gstAmt    = parseFloat(((unitPrice * taxRate) / 100).toFixed(2));
      lineItems = [{
        description: invoice.deal?.title || 'Service',
        unitPrice,
        qty:         1,
        gstAmount:   gstAmt,
        total:       parseFloat((unitPrice + gstAmt).toFixed(2)),
      }];
    }

    const ROW_H = 34;
    lineItems.forEach((item, idx) => {
      const rowY = y + idx * ROW_H;
      if (idx % 2 === 1) doc.rect(PAD, rowY, CW, ROW_H).fill('#FAFAFA');
      doc.moveTo(PAD, rowY + ROW_H).lineTo(C_END, rowY + ROW_H)
         .strokeColor(BORDER).lineWidth(0.5).stroke();

      const tY = rowY + 11;
      doc.fontSize(9).fillColor(SLATE).font('Helvetica')
         .text(item.description || '—', C_DESC + 8, tY, { width: C_UP - C_DESC - 14 });
      doc.fontSize(9).fillColor(MUTED).font('Helvetica')
         .text(fmt(item.unitPrice), C_UP,    tY, { width: C_GST   - C_UP   - 4, align: 'right' })
         .text(fmt(item.gstAmount), C_GST,   tY, { width: C_QTY   - C_GST  - 4, align: 'right' })
         .text(String(item.qty ?? 1), C_QTY, tY, { width: C_TOTAL - C_QTY  - 4, align: 'right' });
      doc.fontSize(9).fillColor(SLATE).font('Helvetica-Bold')
         .text(`Rs. ${fmt(item.total)}`, C_TOTAL, tY, { width: C_END - C_TOTAL - 4, align: 'right' });
    });

    y += lineItems.length * ROW_H + 20;

    // ── 4. TOTALS ───────────────────────────────────────────────────────────
    const TB_W = CW * 0.38;
    const TB_X = PAD + CW - TB_W;
    const TB_PAD_L = 10;

    const subtotal = invoice.amount || 0;
    const taxAmt   = invoice.taxAmount || 0;
    const total    = invoice.totalAmount || 0;
    const taxRate  = invoice.taxRate || 0;

    // Subtotal row
    doc.fontSize(9).fillColor(MUTED).font('Helvetica')
       .text('SUBTOTAL', TB_X + TB_PAD_L, y, { width: TB_W * 0.52 });
    doc.fontSize(9).fillColor(SLATE).font('Helvetica')
       .text(`Rs. ${fmt(subtotal)}`, TB_X + TB_W * 0.52, y, { width: TB_W * 0.44, align: 'right' });
    y += 18;

    if (taxRate > 0) {
      doc.moveTo(TB_X, y - 4).lineTo(TB_X + TB_W, y - 4).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fontSize(9).fillColor(MUTED).font('Helvetica')
         .text(`GST ${taxRate}%`, TB_X + TB_PAD_L, y, { width: TB_W * 0.52 });
      doc.fontSize(9).fillColor(SLATE).font('Helvetica')
         .text(`Rs. ${fmt(taxAmt)}`, TB_X + TB_W * 0.52, y, { width: TB_W * 0.44, align: 'right' });
      y += 18;
    }

    // Total filled row
    doc.rect(TB_X, y - 2, TB_W, 28).fill(INDIGO);
    doc.fontSize(9.5).fillColor(WHITE).font('Helvetica-Bold')
       .text('TOTAL', TB_X + TB_PAD_L, y + 7, { width: TB_W * 0.52 });
    doc.fontSize(9.5).fillColor(WHITE).font('Helvetica-Bold')
       .text(`Rs. ${fmt(total)}`, TB_X + TB_W * 0.52, y + 7, { width: TB_W * 0.44, align: 'right' });

    y += 40;

    // ── 5. NOTES ────────────────────────────────────────────────────────────
    if (invoice.notes) {
      doc.moveTo(PAD, y).lineTo(PW - PAD, y).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 12;
      doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('NOTES', PAD, y);
      y += 11;
      doc.fontSize(9).fillColor(SLATE).font('Helvetica').text(invoice.notes, PAD, y, { width: CW });
      y += doc.heightOfString(invoice.notes, { width: CW }) + 20;
    }

    // ── 6. AUTHORIZED SIGNATURE ─────────────────────────────────────────────
    const sigY    = Math.max(y + 24, doc.page.height - 140);
    const sigBoxW = 180;
    const sigBoxX = PW - PAD - sigBoxW;

    doc.rect(sigBoxX, sigY, sigBoxW, 82)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    doc.fontSize(9).fillColor(SLATE).font('Helvetica-Bold')
       .text(companyName, sigBoxX, sigY + 12, { width: sigBoxW, align: 'center' });

    // Signature line
    const sigLineY = sigY + 56;
    doc.moveTo(sigBoxX + 20, sigLineY).lineTo(sigBoxX + sigBoxW - 20, sigLineY)
       .strokeColor(BORDER).lineWidth(0.5).stroke();

    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
       .text('Authorized Signature', sigBoxX, sigLineY + 7, { width: sigBoxW, align: 'center' });

    // ── 7. FOOTER ───────────────────────────────────────────────────────────
    const FY = doc.page.height - 32;
    doc.moveTo(PAD, FY - 10).lineTo(PW - PAD, FY - 10).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text(`Thank you for your business · ${companyName}`, PAD, FY, { width: CW, align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
