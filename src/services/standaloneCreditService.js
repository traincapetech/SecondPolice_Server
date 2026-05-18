const prisma = require('../lib/prisma');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Calculates unused value of standalone tool passes and applies as Stripe Credit
 */
exports.applyRemainingToolCredits = async (tenantId, stripeCustomerId) => {
  try {
    // 1. Find the primary admin user of this tenant to get the email
    const admin = await prisma.user.findFirst({
      where: { tenantId, role: 'ADMIN' }
    });

    if (!admin) return;

    // 2. Find active passes for this email
    const toolUser = await prisma.toolUser.findUnique({
      where: { email: admin.email },
      include: { passPurchases: { where: { status: 'ACTIVE' } } }
    });

    if (!toolUser || toolUser.passPurchases.length === 0) return;

    let totalCreditAmountInr = 0;

    for (const purchase of toolUser.passPurchases) {
      // Calculate pro-rated remaining value
      const now = new Date();
      const totalDuration = purchase.expiresAt - purchase.purchasedAt;
      const remainingDuration = purchase.expiresAt - now;

      if (remainingDuration > 0) {
        const ratio = remainingDuration / totalDuration;
        const credit = Number(purchase.amountPaid) * ratio;
        totalCreditAmountInr += credit;

        // Mark purchase as credited so it's not reused
        await prisma.toolPassPurchase.update({
          where: { id: purchase.id },
          data: { status: 'CANCELLED' } // Effectively "converted"
        });

        // Log the credit record
        await prisma.standaloneCredit.create({
          data: {
            toolUserId: toolUser.id,
            toolPassPurchaseId: purchase.id,
            originalAmount: purchase.amountPaid,
            creditableAmount: credit,
            status: 'APPLIED',
            appliedAt: now,
            expiresAt: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)) // 30 day validity
          }
        });
      }
    }

    if (totalCreditAmountInr > 0) {
      const amountPaise = Math.round(totalCreditAmountInr * 100);
      
      // 3. Apply as Balance to Stripe Customer
      await stripe.customers.createBalanceTransaction(stripeCustomerId, {
        amount: -amountPaise, // Negative amount in Stripe adds credit
        currency: 'inr',
        description: 'Credit applied from unused standalone tool passes'
      });

      console.log(`💰 Applied ₹${totalCreditAmountInr.toFixed(2)} credit to Customer: ${stripeCustomerId}`);
    }
  } catch (error) {
    console.error('❌ Error applying tool credits:', error.message);
  }
};
