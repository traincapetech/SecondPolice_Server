require('dotenv').config();
const prisma = require('./src/lib/prisma');

async function test() {
  try {
    console.log('Fetching/Creating user...');
    let user = await prisma.toolUser.findFirst();
    if (!user) {
      user = await prisma.toolUser.create({
        data: { email: 'test@example.com', sessionId: 'test-session' }
      });
    }
    console.log('User ID:', user.id);

    console.log('Creating StandaloneInvoice...');
    const inv = await prisma.standaloneInvoice.create({
      data: {
        toolUserId: user.id,
        invoiceNo: 'TEST-' + Date.now(),
        clientName: 'Test Client',
        amount: 100.50,
        totalAmount: 118.59,
        items: [{ desc: 'Test', qty: 1, price: 100.50 }],
        currency: 'INR',
        templateId: 'basic'
      }
    });
    console.log('Success! Invoice ID:', inv.id);
  } catch (err) {
    console.error('TEST FAILED!');
    console.error('Code:', err.code);
    console.error('Meta:', err.meta);
    console.error('Message:', err.message);
  } finally {
    process.exit();
  }
}

test();
