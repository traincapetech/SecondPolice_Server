require('dotenv').config();
const prisma = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

async function createSuperAdmin() {
  const email = process.argv[2] || 'superadmin@secondpolice.com';
  const password = process.argv[3] || 'SuperSecure123!';
  const name = 'Global Super Admin';

  console.log(`🚀 Creating SuperAdmin: ${email}`);

  // 1. Create a System Tenant if not exists (or use an existing one)
  let systemTenant = await prisma.tenant.findFirst({
    where: { name: 'SecondPolice Admin' }
  });

  if (!systemTenant) {
    systemTenant = await prisma.tenant.create({
      data: {
        name: 'SecondPolice Admin',
        domain: 'admin.secondpolice.com',
        seatLimit: 9999
      }
    });
    console.log('✅ System Tenant created');
  }

  // 2. Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 3. Create/Update User
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'SUPERADMIN',
      isEmailVerified: true
    },
    create: {
      email,
      name,
      passwordHash,
      role: 'SUPERADMIN',
      tenantId: systemTenant.id,
      isEmailVerified: true
    }
  });

  console.log('✅ SuperAdmin user is ready!');
  console.log('---------------------------');
  console.log(`Email: ${email}`);
  console.log(`Pass:  ${password}`);
  console.log('---------------------------');
}

createSuperAdmin()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
