require('dotenv').config();
const prisma = require('../src/lib/prisma');

async function main() {
  console.log('🌱 Seeding SaaS data (Idempotent)...');

  // 1. PricingPlans
  const starter = await prisma.pricingPlan.upsert({
    where: { slug: 'starter' },
    update: {
      name: 'Starter',
      features: ['Leads & Pipeline', 'Invoices', 'Team up to 10', 'Email campaigns', 'Analytics']
    },
    create: {
      name: 'Starter',
      slug: 'starter',
      sortOrder: 1,
      features: ['Leads & Pipeline', 'Invoices', 'Team up to 10', 'Email campaigns', 'Analytics']
    }
  });

  const pro = await prisma.pricingPlan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Pro',
      features: ['Everything in Starter', 'HRMS & Payroll', 'Unlimited team', 'API access', 'Priority support']
    },
    create: {
      name: 'Pro',
      slug: 'pro',
      sortOrder: 2,
      features: ['Everything in Starter', 'HRMS & Payroll', 'Unlimited team', 'API access', 'Priority support']
    }
  });

  console.log('✅ Pricing Plans synced');

  // 2. SeatTiers (Clean and Re-create to ensure ranges are correct)
  await prisma.seatTier.deleteMany({ where: { planId: { in: [starter.id, pro.id] } } });
  
  const seatTiersData = [
    { planId: starter.id, label: '1–5 users',  minSeats: 1,  maxSeats: 5,   baseAmountInr: 100,  yearlyAmountInr: 1000,  baseAmountUsd: 10, yearlyAmountUsd: 100 },
    { planId: starter.id, label: '6–10 users', minSeats: 6,  maxSeats: 10,  baseAmountInr: 200,  yearlyAmountInr: 2000,  baseAmountUsd: 20, yearlyAmountUsd: 200 },
    { proId: pro.id,      label: '1–5 users',  minSeats: 1,  maxSeats: 5,   baseAmountInr: 500,  yearlyAmountInr: 5000,  baseAmountUsd: 50, yearlyAmountUsd: 500 },
    { proId: pro.id,      label: '6–10 users', minSeats: 6,  maxSeats: 10,  baseAmountInr: 900,  yearlyAmountInr: 9000,  baseAmountUsd: 90, yearlyAmountUsd: 900 },
  ];

  for (const tier of seatTiersData) {
    const { proId, ...rest } = tier;
    await prisma.seatTier.create({ 
      data: { ...rest, planId: proId || tier.planId } 
    });
  }
  console.log('✅ Seat Tiers synced');

  // 3. TaxConfig
  await prisma.taxConfig.deleteMany({});
  await prisma.taxConfig.createMany({
    data: [
      { name: 'India GST', region: 'INR', taxType: 'GST', rate: 0.18, isActive: true },
      { name: 'International', region: 'USD', taxType: 'NONE', rate: 0, isActive: true },
    ]
  });

  // 4. ToolProducts
  const invoiceTool = await prisma.toolProduct.upsert({
    where: { slug: 'invoice' },
    update: { name: 'Invoice Generator' },
    create: { name: 'Invoice Generator', slug: 'invoice', freeUsageLimit: 5 }
  });

  await prisma.toolPassProduct.deleteMany({ where: { toolProductId: invoiceTool.id } });
  await prisma.toolPassProduct.createMany({
    data: [
      { toolProductId: invoiceTool.id, name: 'Weekly pass', passType: 'WEEKLY', priceInr: 49, priceUsd: 1 },
      { toolProductId: invoiceTool.id, name: 'Per invoice',  passType: 'PER_USE', usageLimit: 1, priceInr: 19, priceUsd: 0.5 },
    ]
  });

  console.log('✅ Tools synced');
  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
