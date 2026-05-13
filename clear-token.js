require('dotenv').config();
const prisma = require('./src/lib/prisma');
async function clear() {
  await prisma.user.updateMany({
    where: { email: 'nitin@traincapetech.in' },
    data: { fcmToken: null }
  });
  console.log('Token cleared for nitin@traincapetech.in. Please trigger a sync from your mobile app now.');
}
clear().catch(console.error).finally(() => process.exit(0));
