require('dotenv').config();
const prisma = require('./src/lib/prisma');

async function checkNitinSubscription() {
  const user = await prisma.user.findFirst({
    where: { email: 'nitin@traincapetech.in' },
    include: {
      tenant: {
        include: {
          subscription: {
            include: {
              plan: true,
              seatTier: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    console.log('User nitin@traincapetech.in not found');
    return;
  }

  console.log('User found:', {
    id: user.id,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    tenantName: user.tenant?.name
  });

  if (user.tenant?.subscription) {
    console.log('Subscription found:', JSON.stringify(user.tenant.subscription, null, 2));
  } else {
    console.log('No subscription found in DB for this tenant.');
  }
}

checkNitinSubscription()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
