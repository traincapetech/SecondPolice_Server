require('dotenv').config();
const prisma = require('./src/lib/prisma');
async function test() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'nitin' } },
    select: { id: true, email: true, fcmToken: true }
  });
  console.log('Search results:', JSON.stringify(users, null, 2));
}
test().catch(console.error).finally(() => process.exit(0));
