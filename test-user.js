const prisma = require('./src/lib/prisma');
async function test() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'nitin' } },
    select: { email: true, fcmToken: true }
  });
  console.log(users);
}
test().finally(() => process.exit(0));
