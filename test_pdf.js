
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Mock data
const data = {
    invoice: {
        invoiceNo: 'INV-2024-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        templateId: 'basic',
        totalAmount: 1000,
        taxRate: 10,
        currency: 'INR'
    },
    company: {
        name: 'Test Company',
        address: '123 Street',
        email: 'test@test.com',
        phone: '1234567890',
        gst: 'GSTIN123',
        pan: 'PAN123'
    },
    client: {
        name: 'Test Client',
        address: '456 Avenue',
        email: 'client@test.com'
    },
    items: [
        { description: 'Item 1', price: 500, quantity: 2, total: 1000 }
    ]
};

const totals = {
    subtotal: 1000,
    tax: 100,
    taxRate: 10,
    total: 1100,
    currency: 'Rs.'
};

const utils = {
    PW: 595,
    PH: 842,
    PAD: 50,
    CW: 495,
    fmt: (v) => v.toFixed(2),
    fmtDate: (d) => d.toDateString(),
    logoBuffer: null
};

// Import the function from pdfGenerator.js (requires commonjs export or mock)
// For simplicity, I'll just copy-paste the drawBasicTemplate here or similar logic
// But let's see if we can just run the file.

// Actually, I'll just check for syntax errors again or common pitfalls.
