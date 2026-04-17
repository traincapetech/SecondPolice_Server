const prisma = require('./src/lib/prisma');

async function main() {
  try {
    const user = await prisma.user.findFirst({
      include: { tenant: true, customRole: true }
    });
    console.log("Success fetching user:", user);
  } catch (error) {
    console.error("Prisma error:", error);
  } finally {
    process.exit(0);
  }
}

main();
