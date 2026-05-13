require('dotenv').config();
const prisma = require('./src/lib/prisma');
async function test() {
  const users = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { email: true, fcmToken: true }
  });
  console.log('Users with tokens:', JSON.stringify(users, null, 2));
}
test().catch(console.error).finally(() => process.exit(0));
