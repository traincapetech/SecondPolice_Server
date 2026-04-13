const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/**
 * Creates an employee for a specific tenant
 */
const addEmployee = async (tenantId, data) => {
  const { name, temporaryPassword, role, customRoleId } = data;
  const email = data.email.toLowerCase().trim();

  // 1. Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('A user with this email already exists in the system.', 400);
  }

  // 2. Hash temporary password
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  // 3. Create User forcibly locked to the Admin's tenantId
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashedPassword,
      role: role || 'EMPLOYEE',
      customRoleId: customRoleId || null,
      tenantId: tenantId // SUPER CRITICAL: Hardcoded from Admin's JWT token
    }
  });

  return user;
};

module.exports = { addEmployee };
