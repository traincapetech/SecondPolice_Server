const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({
    where: { fcmToken: { not: null } },
    select: { email: true, fcmToken: true }
  });
  console.log(user);
}
main().finally(() => prisma.$disconnect());
