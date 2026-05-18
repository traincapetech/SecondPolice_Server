require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../src/lib/prisma');

async function syncStripe() {
  console.log('🔄 Syncing Pricing Catalog with Stripe...');

  const plans = await prisma.pricingPlan.findMany({
    include: { seatTiers: true }
  });

  for (const plan of plans) {
    console.log(`\n📦 Processing Plan: ${plan.name}`);

    // 1. Create/Update Product in Stripe
    // Using slug as ID to prevent duplicates if we re-run
    let stripeProduct;
    try {
      stripeProduct = await stripe.products.create({
        id: plan.slug,
        name: `SecondPolice - ${plan.name}`,
        description: plan.description || `SaaS Subscription for ${plan.name} features`,
        metadata: { planId: plan.id }
      });
      console.log(`✅ Stripe Product created: ${stripeProduct.id}`);
    } catch (err) {
      if (err.code === 'resource_already_exists') {
        stripeProduct = await stripe.products.retrieve(plan.slug);
        console.log(`ℹ️  Stripe Product already exists: ${stripeProduct.id}`);
      } else {
        throw err;
      }
    }

    // 2. Sync Seat Tiers
    for (const tier of plan.seatTiers) {
      console.log(`   🔹 Tier: ${tier.label}`);

      // Create Monthly Price (INR)
      const monthlyPrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Number(tier.baseAmountInr) * 100, // Stripe uses cents/paise
        currency: 'inr',
        recurring: { interval: 'month' },
        metadata: { seatTierId: tier.id, type: 'monthly' }
      });

      // Create Yearly Price (INR)
      const yearlyPrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Number(tier.yearlyAmountInr) * 100,
        currency: 'inr',
        recurring: { interval: 'year' },
        metadata: { seatTierId: tier.id, type: 'yearly' }
      });

      // Update Local DB
      await prisma.seatTier.update({
        where: { id: tier.id },
        data: {
          stripePriceIdMonthly: monthlyPrice.id,
          stripePriceIdYearly: yearlyPrice.id
        }
      });

      console.log(`   ✅ Prices synced: Monthly (${monthlyPrice.id}), Yearly (${yearlyPrice.id})`);
    }
  }

  console.log('\n✨ Stripe Catalog Sync Complete!');
}

syncStripe()
  .catch(e => {
    console.error('❌ Sync Failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
