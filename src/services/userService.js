const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { generateWorkspaceId } = require('../utils/workspaceIdGenerator');

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

  // 2. Check SaaS Seat Limit
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { _count: { select: { users: true } } }
  });

  if (tenant._count.users >= (tenant.seatLimit || 5)) {
    throw new AppError(`Seat limit reached (${tenant.seatLimit}). Please upgrade your plan to add more team members.`, 403);
  }

  // 3. Hash temporary password
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  // 3. Fetch Role info for ID generation
  let roleName = role || 'EMPLOYEE';
  if (customRoleId) {
    const customRole = await prisma.customRole.findUnique({ where: { id: customRoleId } });
    if (customRole) roleName = customRole.name;
  }
  const workspaceId = await generateWorkspaceId(tenant.name, roleName);

  // 4. Create User forcibly locked to the Admin's tenantId
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashedPassword,
      role: role || 'EMPLOYEE',
      customRoleId: customRoleId || null,
      workspaceId,
      tenantId: tenantId, // SUPER CRITICAL: Hardcoded from Admin's JWT token
      isEmailVerified: true, // Admin-created accounts skip email verification
    }
  });

  return { ...user, companyName: tenant.name };
};

module.exports = { addEmployee };
