const prisma = require('../lib/prisma');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { generateInvoicePDF } = require('../utils/pdfGenerator');

const TOOL_PRICE = 10;

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

// Helpers
const getToolUser = async (sessionId, email) => {
  if (email) {
    let user = await prisma.toolUser.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.toolUser.create({ data: { email, sessionId } });
    }
    return user;
  }
  
  if (sessionId) {
    let user = await prisma.toolUser.findUnique({ where: { sessionId } });
    if (!user) {
      user = await prisma.toolUser.create({ data: { sessionId } });
    }
    return user;
  }
  
  // If neither, generate a new anonymous session
  const newSessionId = crypto.randomBytes(16).toString('hex');
  return await prisma.toolUser.create({ data: { sessionId: newSessionId } });
};

// @desc    Register or get standalone user session
// @route   POST /api/tools/auth/session
// @access  Public
exports.getOrCreateSession = async (req, res) => {
  try {
    const { sessionId, email } = req.body;
    const user = await getToolUser(sessionId, email);
    
    // Also return their current usage and active purchases
    const usage = await prisma.toolUsage.findFirst({
      where: { toolUserId: user.id, tool: 'INVOICE' }
    });
    
    const activePass = await prisma.toolPurchase.findFirst({
      where: { 
        toolUserId: user.id, 
        tool: 'INVOICE',
        status: 'COMPLETED',
        OR: [
          { type: 'WEEKLY_PASS', expiresAt: { gt: new Date() } },
          { type: 'LIFETIME' }
        ]
      }
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId: user.sessionId,
        email: user.email,
        usageCount: usage ? usage.usageCount : 0,
        hasActivePass: !!activePass,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Generate an invoice
// @route   POST /api/tools/invoice/generate
// @access  Public
exports.generateInvoice = async (req, res) => {
  try {
    const { sessionId, email, invoiceData } = req.body;
    console.log('Generating invoice with data:', JSON.stringify(invoiceData, null, 2));
    
    // 1. Get or create user
    const user = await getToolUser(sessionId, email);

    // 2. Check limits and permissions
    let usage = await prisma.toolUsage.findFirst({
      where: { toolUserId: user.id, tool: 'INVOICE' }
    });

    if (!usage) {
      usage = await prisma.toolUsage.create({
        data: { toolUserId: user.id, tool: 'INVOICE', usageCount: 0 }
      });
    }

    const activePass = await prisma.toolPurchase.findFirst({
      where: { 
        toolUserId: user.id, 
        tool: 'INVOICE',
        status: 'COMPLETED',
        OR: [
          { type: 'WEEKLY_PASS', expiresAt: { gt: new Date() } },
          { type: 'LIFETIME' }
        ]
      }
    });

    // 2. Check limits and permissions
    const templateId = invoiceData.templateId || 'basic';
    const isPremiumTemplate = ['creative', 'executive'].includes(templateId);

    // If premium template, require active pass
    if (isPremiumTemplate && !activePass) {
      return res.status(403).json({
        success: false,
        requiresPayment: true,
        message: 'Premium templates require a one-time purchase.'
      });
    }

    // Unlimited free invoices for basic templates
    // (Payment still required for premium templates)

    // 3. Save the invoice
    const newInvoice = await prisma.standaloneInvoice.create({
      data: {
        toolUserId: user.id,
        invoiceNo: invoiceData.invoiceNo || `INV-${Date.now()}`,
        clientName: invoiceData.clientName,
        clientEmail: invoiceData.clientEmail,
        clientAddress: invoiceData.clientAddress,
        clientPhone: invoiceData.clientPhone || null,
        senderName: invoiceData.senderName,
        senderEmail: invoiceData.senderEmail,
        senderAddress: invoiceData.senderAddress,
        senderPhone: invoiceData.senderPhone || null,
        senderGstin: invoiceData.senderGstin || null,
        senderPan: invoiceData.senderPan || null,
        senderBusinessCategory: invoiceData.senderBusinessCategory || null,
        logoUrl: invoiceData.logoUrl || null,
        amount: invoiceData.amount,
        currency: invoiceData.currency || 'INR',
        taxRate: invoiceData.taxRate || 0,
        taxAmount: invoiceData.taxAmount || 0,
        totalAmount: invoiceData.totalAmount,
        invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
        items: invoiceData.items || [],
        notes: invoiceData.notes,
      }
    });

    // 4. Increment usage
    await prisma.toolUsage.update({
      where: { id: usage.id },
      data: { usageCount: { increment: 1 } }
    });

    res.status(201).json({
      success: true,
      data: newInvoice,
      usageCount: usage.usageCount + 1,
      hasActivePass: !!activePass
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ success: false, error: 'Server Error', details: error.message });
  }
};

// @desc    Create Razorpay Order for Template Access
// @route   POST /api/tools/checkout
// @access  Public
exports.createCheckout = async (req, toolRes) => {
  try {
    const { sessionId, email, templateId } = req.body;
    
    // Ensure user exists
    const user = await getToolUser(sessionId, email);

    // Create Razorpay Order
    const options = {
      amount: TOOL_PRICE * 100, // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: `receipt_order_${Date.now()}_${user.id.substring(0, 5)}`
    };

    const order = await razorpayInstance.orders.create(options);

    if (!order) return toolRes.status(500).json({ success: false, message: 'Failed to create order' });

    toolRes.status(200).json({
      success: true,
      order,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Razorpay Create Order Error:", error);
    toolRes.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/tools/verify-payment
// @access  Public
exports.verifyPayment = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      sessionId,
      email,
      templateId
    } = req.body;

    const user = await getToolUser(sessionId, email);

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Record the purchase
      await prisma.toolPurchase.create({
        data: {
          toolUserId: user.id,
          tool: 'INVOICE',
          type: 'PER_INVOICE', // Or could be template-specific: `TEMPLATE_${templateId}`
          currency: 'INR',
          amount: TOOL_PRICE,
          status: 'COMPLETED'
        }
      });

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully. Template unlocked!'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Download standalone invoice PDF
// @route   GET /api/tools/invoice/download/:id
// @access  Public
exports.downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.standaloneInvoice.findUnique({
      where: { id }
    });

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Build the full tenant-like object so pdfGenerator renders all GST fields.
    const tenantPlaceholder = {
      name: invoice.senderName || 'Your Company',
      companyProfile: {
        businessCategory: invoice.senderBusinessCategory || null,
        address:          invoice.senderAddress          || null,
        gstin:            invoice.senderGstin            || null,
        pan:              invoice.senderPan              || null,
        companyEmail:     invoice.senderEmail            || null,
        companyPhone:     invoice.senderPhone            || null,
        logoUrl:          invoice.logoUrl                || null,
      }
    };

    // Attach dates so pdfGenerator can render them correctly
    const invoiceForPdf = { 
      ...invoice, 
      clientPhone: invoice.clientPhone || null,
      createdAt: invoice.invoiceDate || invoice.createdAt // Use specified invoiceDate as primary
    };

    const pdfBuffer = await generateInvoicePDF(invoiceForPdf, tenantPlaceholder);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNo}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Download Error:", error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
