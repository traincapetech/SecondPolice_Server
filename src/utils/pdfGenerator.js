const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs');

/**
 * Helper to fetch image buffer from URL or local path
 */
async function fetchImage(url) {
   if (!url) return null;
   try {
      // Handle base64
      if (url.startsWith('data:image')) {
         const base64Data = url.split(',')[1];
         return Buffer.from(base64Data, 'base64');
      }

      // Handle local file path (e.g. c:\...)
      if (url.includes(':\\') || url.startsWith('/')) {
         if (fs.existsSync(url)) {
            return fs.readFileSync(url);
         }
         return null;
      }

      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
      return Buffer.from(response.data, 'binary');
   } catch (error) {
      console.error('Logo fetch failed for URL:', url, error.message);
      return null;
   }
}

/**
 * generateInvoicePDF(invoice, tenant)
 */
async function generateInvoicePDF(invoice, tenant = {}) {
   const doc = new PDFDocument({ margin: 0, size: 'A4' });
   const chunks = [];
   doc.on('data', chunk => chunks.push(chunk));

   const pdfBufferPromise = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => {
         console.error('PDFKit Error:', err);
         reject(err);
      });
   });

   const companyProfile = tenant.companyProfile || {};

   const company = {
      name: invoice.senderName || tenant.name || 'YOUR COMPANY',
      address: invoice.senderAddress || companyProfile.address || '',
      phone: invoice.senderPhone || companyProfile.companyPhone || '',
      email: invoice.senderEmail || companyProfile.companyEmail || '',
      gst: invoice.senderGstin || companyProfile.gstin || '',
      pan: invoice.senderPan || companyProfile.pan || '',
      category: invoice.senderBusinessCategory || companyProfile.businessCategory || '',
      logoUrl: invoice.logoUrl || companyProfile.logoUrl || null
   };

   const client = {
      name: invoice.clientName || '',
      address: invoice.clientAddress || '',
      email: invoice.clientEmail || '',
      phone: invoice.clientPhone || ''
   };

   const rawItems = Array.isArray(invoice.items) ? invoice.items : [];
   const lineItems = rawItems.map(item => ({
      description: item.description || item.desc || 'Service/Item',
      quantity: Number(item.qty || item.quantity) || 1,
      price: Number(item.price || item.unitPrice) || 0,
      total: (Number(item.qty || item.quantity) || 1) * (Number(item.price || item.unitPrice) || 0)
   }));

   const totals = {
      subtotal: Number(invoice.amount) || 0,
      tax: Number(invoice.taxAmount) || 0,
      total: Number(invoice.totalAmount) || 0,
      taxRate: Number(invoice.taxRate) || 0,
      currency: invoice.currency === 'INR' ? 'Rs.' : (invoice.currency === 'USD' ? '$' : invoice.currency)
   };

   // Helper Utils
   const PW = 595;
   const PH = 842;
   const PAD = 50;
   const CW = PW - (PAD * 2);

   const fmt = (val) => {
      const n = Number(val);
      return isNaN(n) ? '0.00' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
   };
   const fmtDate = (d) => {
      if (!d) return '—';
      const date = new Date(d);
      return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
   };

   // Fetch logo
   let logoBuffer = null;
   if (company.logoUrl) {
      logoBuffer = await fetchImage(company.logoUrl);
   }

   const drawUtils = { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer };

   // TEMPLATE SELECTOR
   try {
      switch (invoice.templateId) {
         case 'standard':
            drawStandardTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'modern':
            drawModernTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'elegant':
            drawElegantTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'minimalist':
            drawMinimalistTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'creative':
            drawCreativeTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'executive':
            drawExecutiveTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'futuristic':
            drawFuturisticTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'royal':
            drawRoyalTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'startup':
            drawStartupTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
         case 'basic':
         default:
            drawBasicTemplate(doc, invoice, company, client, lineItems, totals, drawUtils);
            break;
      }
   } catch (err) {
      console.error('CRITICAL: Template Drawing Error:', err);
      doc.fontSize(12).fillColor('red').text('Critical Error generating layout: ' + err.message, 50, 50);
   }

   doc.end();
   return pdfBufferPromise;
}

// 1. BASIC MINIMAL
function drawBasicTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, fmt, fmtDate, logoBuffer } = utils;
   doc.save();

   // Top Accent Line
   doc.rect(0, 0, PW, 4).fill('#4f46e5');

   // 1. Header
   const headerY = 25; // Moved up from 40
   if (logoBuffer) {
      try {
         doc.image(logoBuffer, PAD, headerY, { width: 50 });
         doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text(company.name || '', PAD + 65, headerY + 10);
      } catch (e) {
         doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text(company.name || '', PAD, headerY + 10);
      }
   } else {
      doc.fillColor('#0f172a').fontSize(24).font('Helvetica-Bold').text(company.name || '', PAD, headerY + 10);
   }

   // Category
   doc.fillColor('#4f46e5').fontSize(8).font('Helvetica-Bold').text((company.category || '').toUpperCase(), logoBuffer ? PAD + 65 : PAD, headerY + 32, { characterSpacing: 1.5 });

   // Right Side Header (Matching 2nd image)
   doc.fillColor('#0f172a').fontSize(40).font('Helvetica-Bold').text('INVOICE', PAD, headerY + 5, { align: 'right', width: CW });
   doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text(`Ref: #${invoice.invoiceNo || ''}`, PAD, headerY + 48, { align: 'right', width: CW });

   doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(`DATE: ${fmtDate(invoice.invoiceDate || invoice.createdAt)}`, PAD, headerY + 70, { align: 'right', width: CW });
   if (invoice.dueDate) {
      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(`DUE: ${fmtDate(invoice.dueDate)}`, PAD, headerY + 85, { align: 'right', width: CW });
   }

   // 2. Address Grid - Centered with more space
   const infoY = 170;
   const col1X = PAD + 40;
   const col2X = PAD + 280;

   // Billed From
   doc.fillColor('#64748b').fontSize(8.5).font('Helvetica-Bold').text('BILLED FROM', col1X, infoY, { characterSpacing: 1.5 });
   doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(company.name || '', col1X, infoY + 12);
   doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(company.address || '', col1X, infoY + 24, { width: 170, lineGap: 1 });
   let currentY = doc.y + 2;
   if (company.email) { doc.fillColor('#64748b').fontSize(7).text(company.email, col1X, currentY); currentY += 9; }
   if (company.phone) { doc.fillColor('#64748b').fontSize(7).text(company.phone, col1X, currentY); currentY += 9; }
   if (company.gst) { doc.fillColor('#1e293b').fontSize(7).font('Helvetica').text(`GST: ${company.gst}`, col1X, currentY); currentY += 9; }
   if (company.pan) { doc.fillColor('#1e293b').fontSize(7).font('Helvetica').text(`PAN: ${company.pan}`, col1X, currentY); currentY += 9; }

   // Billed To
   doc.fillColor('#64748b').fontSize(8.5).font('Helvetica-Bold').text('BILLED TO', col2X, infoY, { characterSpacing: 1.5 });
   doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(client.name || '—', col2X, infoY + 12);
   doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(client.address || '—', col2X, infoY + 24, { width: 170, lineGap: 1 });
   if (client.email) { doc.fillColor('#64748b').fontSize(7).text(client.email, col2X, doc.y + 1); }

   // 3. Table Header
   doc.y = Math.max(currentY, doc.y + 10) + 35;
   const tableTop = doc.y;
   doc.rect(PAD, tableTop, CW, 0.5).fill('#e2e8f0');
   doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold').text('DESCRIPTION', PAD, tableTop + 10);
   doc.text('PRICE', PAD + 240, tableTop + 10, { width: 50, align: 'center' });
   doc.text('QTY', PAD + 300, tableTop + 10, { width: 40, align: 'center' });
   doc.text('AMOUNT', PAD, tableTop + 10, { align: 'right', width: CW });
   doc.y = tableTop + 25;

   const currency = 'Rs.'; // Use Rs. to avoid broken characters in PDFKit default fonts

   // 4. Items
   items.forEach(item => {
      if (doc.y > 780) doc.addPage();
      const rowY = doc.y + 8;
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text(item.description, PAD, rowY, { width: 230 });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(`${currency}${fmt(item.price)}`, PAD + 240, rowY, { width: 50, align: 'center' });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(item.quantity, PAD + 300, rowY, { width: 40, align: 'center' });
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(`${currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(1.2);
      doc.rect(PAD, doc.y, CW, 0.2).fill('#f1f5f9');
   });

   // 5. Totals - Balanced width
   const boxW = 500;
   const boxH = 110;
   if (doc.y + boxH + 40 > 820) doc.addPage();

   const boxY = doc.y + 30;
   doc.roundedRect(PW - PAD - boxW, boxY, boxW, boxH, 15).fill('#0f172a');

   const textX = PW - PAD - boxW + 25;
   const innerCW = boxW - 50;

   doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text('Subtotal', textX, boxY + 20);
   doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(`${currency}${fmt(totals.subtotal)}`, textX, boxY + 20, { align: 'right', width: innerCW });

   if (totals.tax > 0) {
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text(`GST (${totals.taxRate}%)`, textX, boxY + 38);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(`${currency}${fmt(totals.tax)}`, textX, boxY + 38, { align: 'right', width: innerCW });
   }

   doc.rect(textX, boxY + 58, innerCW, 0.5).fill('#1e293b');
   doc.fillColor('#818cf8').fontSize(10).font('Helvetica-Bold').text('GRAND TOTAL', textX, boxY + 75);
   doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(`${currency}${fmt(totals.total)}`, textX, boxY + 75, { align: 'right', width: innerCW });

   // 6. Notes
   if (invoice.notes) {
      doc.y = boxY + boxH + 12;
      doc.fillColor('#4f46e5').fontSize(7).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y, { characterSpacing: 1 });
      doc.fillColor('#1e293b').fontSize(8).font('Helvetica').text(invoice.notes, PW - PAD - boxW, doc.y + 10, { width: boxW, lineGap: 1 });
   }
   doc.restore();
}

function drawStandardTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();

   // Top Accent Line
   doc.rect(0, 0, PW, 15).fill('#4f46e5');

   // 1. Header
   const headerY = 40;
   let textX = PAD;
   if (logoBuffer) {
      try {
         doc.image(logoBuffer, PAD, headerY, { width: 50, height: 50, fit: [50, 50], align: 'center', valign: 'center' });
         doc.roundedRect(PAD, headerY, 50, 50, 5).lineWidth(0.5).stroke('#e2e8f0');
         textX = PAD + 65;
      } catch (e) {
         textX = PAD;
      }
   } else {
      // Initials box
      doc.roundedRect(PAD, headerY, 40, 40, 5).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text(company.name ? company.name.charAt(0).toUpperCase() : 'C', PAD, headerY + 10, { width: 40, align: 'center' });
      textX = PAD + 55;
   }

   // Company Details
   doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(company.name || '', textX, headerY);
   doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text((company.category || ''), textX, headerY + 20);

   let currY = headerY + 40;
   doc.fillColor('#64748b').fontSize(8).font('Helvetica');
   if (company.address) { doc.text(company.address, textX, currY, { width: 180, lineGap: 2 }); currY = doc.y; }
   if (company.email) { doc.text(`Email: ${company.email}`, textX, currY); currY += 12; }
   if (company.phone) { doc.text(`Phone: ${company.phone}`, textX, currY); currY += 12; }

   currY += 5;
   if (company.gst) { doc.fillColor('#64748b').font('Helvetica-Bold').text(`GST: ${company.gst}`, textX, currY); currY += 12; }
   if (company.pan) { doc.text(`PAN: ${company.pan}`, textX, currY); currY += 12; }

   // Right Side Header
   doc.fillColor('#818cf8').fontSize(9).font('Helvetica-Bold').text('TAX INVOICE', PAD, headerY, { align: 'right', width: CW, characterSpacing: 1 });
   doc.fillColor('#0f172a').fontSize(24).font('Helvetica-Bold').text(`#${invoice.invoiceNo || ''}`, PAD, headerY + 12, { align: 'right', width: CW });
   doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text(fmtDate(invoice.invoiceDate || invoice.createdAt), PAD, headerY + 42, { align: 'right', width: CW });

   // 2. Three Boxes
   const boxTop = Math.max(currY + 20, 180);
   const boxWidth = (CW - 30) / 3;

   // Box 1: Billed To
   doc.roundedRect(PAD, boxTop, boxWidth, 110, 10).fill('#f8fafc');
   doc.roundedRect(PAD, boxTop, boxWidth, 110, 10).lineWidth(0.5).stroke('#f1f5f9');
   doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('BILLED TO', PAD + 15, boxTop + 15, { characterSpacing: 1.5 });
   doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(client.name || '—', PAD + 15, boxTop + 35);
   let clientY = boxTop + 55;
   doc.fillColor('#64748b').fontSize(9).font('Helvetica');
   if (client.address) { doc.text(client.address, PAD + 15, clientY, { width: boxWidth - 30, lineGap: 2 }); clientY = doc.y; }
   if (client.email) { doc.text(client.email, PAD + 15, clientY); clientY += 12; }
   if (client.phone) { doc.text(client.phone, PAD + 15, clientY); clientY += 12; }

   // Box 2: Payment Due
   const box2X = PAD + boxWidth + 15;
   doc.roundedRect(box2X, boxTop, boxWidth, 110, 10).fill('#f8fafc');
   doc.roundedRect(box2X, boxTop, boxWidth, 110, 10).lineWidth(0.5).stroke('#f1f5f9');
   doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('PAYMENT DUE', box2X + 15, boxTop + 15, { characterSpacing: 1.5 });
   doc.fillColor('#ef4444').fontSize(11).font('Helvetica-Bold').text(invoice.dueDate ? fmtDate(invoice.dueDate) : '—', box2X + 15, boxTop + 35);
   doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('Immediate payment requested.', box2X + 15, boxTop + 55, { width: boxWidth - 30, lineGap: 2 });

   // Box 3: Total Amount
   const box3X = PAD + (boxWidth * 2) + 30;
   doc.roundedRect(box3X, boxTop, boxWidth, 110, 10).fill('#0f172a');
   doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('TOTAL AMOUNT', box3X + 15, boxTop + 15, { characterSpacing: 1.5 });
   doc.fillColor('#818cf8').fontSize(22).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, box3X + 15, boxTop + 70);

   // 3. Table Header
   const tableTop = boxTop + 140;
   doc.rect(PAD, tableTop, CW, 1).fill('#f1f5f9');
   const thY = tableTop + 15;

   doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('ITEM DESCRIPTION', PAD + 10, thY, { characterSpacing: 1 });
   doc.text('PRICE', PAD + 280, thY, { width: 50, align: 'center', characterSpacing: 1 });
   doc.text('QTY', PAD + 340, thY, { width: 40, align: 'center', characterSpacing: 1 });
   doc.text('TOTAL', PAD, thY, { align: 'right', width: CW - 10, characterSpacing: 1 });

   doc.y = thY + 20;

   // 4. Items
   items.forEach(item => {
      if (doc.y > 750) doc.addPage();
      const rowY = doc.y + 10;
      doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(item.description, PAD + 10, rowY, { width: 250 });
      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.price)}`, PAD + 280, rowY, { width: 50, align: 'center' });
      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(item.quantity, PAD + 340, rowY, { width: 40, align: 'center' });
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW - 10 });

      doc.moveDown(1.5);
      doc.rect(PAD + 10, doc.y, CW - 20, 0.5).fill('#f8fafc');
   });

   // 5. Totals Box (Like DarkTotals in UI)
   doc.moveDown(2);
   if (doc.y + 160 > 800) doc.addPage(); // give enough space for total and notes

   const tBoxW = 490; // wider total box

   // Calculate height of DarkTotals box
   let tBoxH = 85;
   if (totals.tax > 0) tBoxH += 20;

   doc.rect(PAD, doc.y, CW, 1).fill('#f1f5f9'); // border-t-2 border-slate-100

   const subY = doc.y + 20;

   // Rounded Dark Box
   doc.roundedRect(PW - PAD - tBoxW, subY, tBoxW, tBoxH, 15).fill('#0f172a');

   let currTotalY = subY + 15;
   doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text('Subtotal', PW - PAD - tBoxW + 20, currTotalY);
   doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.subtotal)}`, PW - PAD - tBoxW, currTotalY, { align: 'right', width: tBoxW - 20 });
   currTotalY += 20;

   if (totals.tax > 0) {
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text(`GST (${totals.taxRate}%)`, PW - PAD - tBoxW + 20, currTotalY);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.tax)}`, PW - PAD - tBoxW, currTotalY, { align: 'right', width: tBoxW - 20 });
      currTotalY += 20;
   }

   // Optional line before grand total
   doc.rect(PW - PAD - tBoxW + 20, currTotalY - 5, tBoxW - 40, 0.5).fill('#1e293b');

   doc.fillColor('#818cf8').fontSize(10).font('Helvetica-Bold').text('GRAND TOTAL', PW - PAD - tBoxW + 20, currTotalY + 5);
   doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - tBoxW, currTotalY + 2, { align: 'right', width: tBoxW - 20 });

   // 6. Notes Box
   if (invoice.notes) {
      doc.y = subY + tBoxH + 15;

      doc.font('Helvetica-Bold').fontSize(10);
      const notesH = doc.heightOfString(invoice.notes, { width: tBoxW - 30 }) + 40;
      doc.roundedRect(PW - PAD - tBoxW, doc.y, tBoxW, notesH, 10).fill('#f8fafc');
      doc.roundedRect(PW - PAD - tBoxW, doc.y, tBoxW, notesH, 10).lineWidth(0.5).stroke('#f1f5f9');

      doc.fillColor('#4f46e5').fontSize(8).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - tBoxW + 15, doc.y + 15, { characterSpacing: 1 });
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(invoice.notes, PW - PAD - tBoxW + 15, doc.y + 35, { width: tBoxW - 30 });
   }
   doc.restore();
}

function drawModernTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   const sideW = 195;
   doc.rect(0, 0, sideW, PH).fill('#062019');
   if (logoBuffer) { try { doc.image(logoBuffer, 35, 50, { width: 60 }); } catch (e) { } }

   const mainX = sideW + 40;
   doc.fillColor('#0f172a').fontSize(42).font('Helvetica-Bold').text('SERVICES', mainX, 55);

   doc.y = 180;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text(item.description, mainX, rowY, { width: CW - 250 });
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, mainX, rowY, { align: 'right', width: CW - sideW - 40 });
      doc.moveDown(4);
   });

   const boxW = 280;
   const boxH = 90;
   const bottomY = PH - 200;
   doc.rect(PW - PAD - boxW, bottomY, boxW, boxH).fill('#062019');
   doc.fillColor('#10b981').fontSize(11).font('Helvetica-Bold').text('GRAND TOTAL', PW - PAD - boxW + 20, bottomY + 20);
   doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, bottomY + 50, { align: 'right', width: boxW - 20 });

   if (invoice.notes) {
      doc.y = bottomY + boxH + 15;
      doc.fillColor('#10b981').fontSize(8).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#062019').fontSize(10).font('Helvetica-Bold').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawElegantTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.rect(0, 0, PW, PH).fill('#fcfaf7');

   doc.y = 200;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#3d3228').fontSize(24).font('Times-Italic').text(item.description, PAD + 35, rowY, { width: CW - 150 });
      doc.fillColor('#3d3228').fontSize(18).font('Helvetica').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(4);
   });

   const boxW = 280;
   const boxH = 90;
   doc.rect(PW - PAD - boxW, PH - 220, boxW, boxH).fill('#3d3228');
   doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 180, { align: 'right', width: boxW - 20 });

   if (invoice.notes) {
      doc.y = PH - 110;
      doc.fillColor('#d4c3a3').fontSize(9).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#3d3228').fontSize(11).font('Helvetica-Bold').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawMinimalistTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.y = 150;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#000000').fontSize(18).font('Helvetica-Bold').text(item.description, PAD + 100, rowY, { width: CW - 200 });
      doc.fillColor('#000000').fontSize(24).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(5);
   });

   const boxW = 280;
   const boxH = 90;
   doc.rect(PW - PAD - boxW, PH - 200, boxW, boxH).fill('#000000');
   doc.fillColor('#ffffff').fontSize(36).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 160, { align: 'right', width: boxW - 20 });

   if (invoice.notes) {
      doc.y = PH - 90;
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawStartupTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.y = 150;
   items.forEach(item => {
      const rowY = doc.y;
      doc.rect(PAD, rowY, CW, 60).fill('#fff1f2');
      doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text(item.description, PAD + 30, rowY + 18, { width: CW - 150 });
      doc.fillColor('#e11d48').fontSize(32).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY + 14, { align: 'right', width: CW - 20 });
      doc.moveDown(7);
   });

   const boxW = 280;
   const boxH = 95;
   doc.rect(PW - PAD - boxW, PH - 220, boxW, boxH).fill('#0f172a');
   doc.fillColor('#ffffff').fontSize(36).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 180, { align: 'right', width: boxW - 25 });

   if (invoice.notes) {
      doc.y = PH - 110;
      doc.fillColor('#e11d48').fontSize(9).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawFuturisticTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.rect(0, 0, PW, PH).fill('#000000');
   doc.y = 150;
   items.forEach(item => {
      const rowY = doc.y;
      doc.rect(PAD, rowY, CW, 50).fill('#06b6d4').opacity(0.1);
      doc.fillColor('#ffffff').fontSize(14).font('Courier-Bold').text(item.description, PAD + 20, rowY + 15, { width: CW - 150 }).opacity(1);
      doc.fillColor('#06b6d4').fontSize(24).font('Courier-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY + 12, { align: 'right', width: CW - 20 });
      doc.moveDown(6);
   });

   const boxW = 280;
   const boxH = 90;
   doc.rect(PW - PAD - boxW, PH - 200, boxW, boxH).fill('#06b6d4').opacity(0.2);
   doc.fillColor('#06b6d4').fontSize(36).font('Courier-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 160, { align: 'right', width: boxW - 25 }).opacity(1);

   if (invoice.notes) {
      doc.y = PH - 90;
      doc.fillColor('#06b6d4').fontSize(9).font('Courier-Bold').text('NOTES / SYSTEM DATA', PW - PAD - boxW, doc.y);
      doc.fillColor('#ffffff').fontSize(10).font('Courier').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawRoyalTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.rect(0, 0, PW, PH).fill('#fdfcf0');
   doc.y = 200;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#78350f').fontSize(20).font('Times-Italic').text(item.description, PAD + 50, rowY, { width: CW - 150 });
      doc.fillColor('#78350f').fontSize(24).font('Times-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(5);
   });

   const boxW = 280;
   const boxH = 95;
   doc.rect(PW - PAD - boxW, PH - 210, boxW, boxH).fill('#78350f');
   doc.fillColor('#ffffff').fontSize(36).font('Times-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 175, { align: 'right', width: boxW - 25 });

   if (invoice.notes) {
      doc.y = PH - 100;
      doc.fillColor('#78350f').fontSize(10).font('Times-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#78350f').fontSize(11).font('Times-Italic').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawCreativeTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.y = 250;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#1e293b').fontSize(18).font('Helvetica-Bold').text(item.description, PAD, rowY, { width: CW - 150 });
      doc.fillColor('#4f46e5').fontSize(24).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(4);
   });

   const boxW = 280;
   const boxH = 90;
   doc.rect(PW - PAD - boxW, PH - 200, boxW, boxH).fill('#0f172a');
   doc.fillColor('#ffffff').fontSize(36).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 165, { align: 'right', width: boxW - 25 });

   if (invoice.notes) {
      doc.y = PH - 90;
      doc.fillColor('#4f46e5').fontSize(9).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

function drawExecutiveTemplate(doc, invoice, company, client, items, totals, utils) {
   const { PW, PAD, CW, PH, fmt, fmtDate, logoBuffer } = utils;
   doc.save();
   doc.rect(0, 0, PW, PH).fill('#18181b');
   doc.y = 200;
   items.forEach(item => {
      const rowY = doc.y;
      doc.fillColor('#a1a1aa').fontSize(16).text(item.description, PAD, rowY, { width: CW - 150 });
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(`${totals.currency}${fmt(item.total)}`, PAD, rowY, { align: 'right', width: CW });
      doc.moveDown(5);
   });

   const boxW = 280;
   const boxH = 90;
   doc.rect(PW - PAD - boxW, PH - 220, boxW, boxH).fill('#000000');
   doc.fillColor('#ffffff').fontSize(32).font('Helvetica-Bold').text(`${totals.currency}${fmt(totals.total)}`, PW - PAD - boxW, PH - 185, { align: 'right', width: boxW - 25 });

   if (invoice.notes) {
      doc.y = PH - 110;
      doc.fillColor('#4f46e5').fontSize(9).font('Helvetica-Bold').text('NOTES / BANK DETAILS', PW - PAD - boxW, doc.y);
      doc.fillColor('#ffffff').fontSize(11).text(invoice.notes, PW - PAD - boxW, doc.y + 15, { width: boxW });
   }
   doc.restore();
}

module.exports = { generateInvoicePDF };
