const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

const { sendEmail } = require('../utils/emailService');
const { generateWorkspaceId } = require('../utils/workspaceIdGenerator');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Signs a JWT with user and tenant details
 */
const signToken = (userId, tenantId, role) => {
  return jwt.sign(
    { userId, tenantId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE_IN || '90d' }
  );
};

/**
 * Register — saves to PendingRegistration only.
 * No Tenant or User is created until the OTP is verified.
 */
const registerTenant = async (data) => {
  const { companyName, name, password } = data;
  const email = data.email.toLowerCase().trim();
  // 1. Block if a verified account already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('An account with this email already exists.', 400);
  }

  // 2. Hash password & Generate OTP
  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // 3. Upsert into PendingRegistration (overwrite if they re-register)
  const pending = await prisma.pendingRegistration.upsert({
    where: { email },
    create: { email, name, companyName, passwordHash: hashedPassword, otp, otpExpiry },
    update: { name, companyName, passwordHash: hashedPassword, otp, otpExpiry },
  });

  // 4. Send OTP email
  try {
    await sendEmail( 
      email, name,
      'Verify Your Workspace Account',
      `<p>Hi ${name},</p><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
    );
  } catch (err) {
    console.error('Failed to send OTP during registration', err);
  }

  // 5. Return a signed pendingToken so the frontend can reference this pending record
  const pendingToken = jwt.sign(
    { type: 'pending_registration', pendingId: pending.id },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  return { pendingToken };
};

/**
 * Login logic
 */
const login = async (emailRaw, password) => {
  const email = emailRaw.toLowerCase().trim();
  // 1. Find user and include tenant details
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Incorrect email or password!', 401);
  }

  // 2. Lazy-generate workspaceId if missing (legacy users)
  let updatedUser = user;
  if (!user.workspaceId) {
    let roleName = user.role;
    if (user.customRoleId) {
      const customRole = await prisma.customRole.findUnique({ where: { id: user.customRoleId } });
      if (customRole) roleName = customRole.name;
    }
    const workspaceId = await generateWorkspaceId(user.tenant.name, roleName);
    updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { workspaceId },
      include: { tenant: true }
    });
  }

  // 3. Sign token
  const token = signToken(updatedUser.id, updatedUser.tenantId, updatedUser.role);

  return { 
    token, 
    user: { 
      ...updatedUser, 
      companyName: updatedUser.tenant.name 
    } 
  };
};

/**
 * OTP Verification Logic
 * Handles two cases:
 *  1. pendingToken provided → complete registration (create Tenant + User)
 *  2. userId provided → verify email for already-in-DB user (legacy / re-verify)
 */
const verifyEmailOTP = async ({ userId, otpCode, pendingToken }) => {
  // --- CASE 1: Completing a pending registration ---
  if (pendingToken) {
    let payload;
    try {
      payload = jwt.verify(pendingToken, process.env.JWT_SECRET);
    } catch {
      throw new AppError('Verification link has expired. Please register again.', 400);
    }
    if (payload.type !== 'pending_registration') throw new AppError('Invalid token.', 400);

    const pending = await prisma.pendingRegistration.findUnique({ where: { id: payload.pendingId } });
    if (!pending) throw new AppError('Registration request not found or already completed.', 404);
    if (pending.otp !== otpCode || !pending.otpExpiry || pending.otpExpiry < new Date()) {
      throw new AppError('Invalid or expired verification code.', 400);
    }

    // Create the real Tenant + User inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: pending.companyName } });
      const workspaceId = await generateWorkspaceId(pending.companyName, 'ADMIN');
      const user = await tx.user.create({
        data: {
          name: pending.name,
          email: pending.email,
          passwordHash: pending.passwordHash,
          role: 'ADMIN',
          workspaceId,
          tenantId: tenant.id,
          isEmailVerified: true,
        },
      });
      await tx.pendingRegistration.delete({ where: { id: pending.id } });
      return { user, tenant };
    });

    const token = signToken(result.user.id, result.tenant.id, result.user.role);
    return { 
      token, 
      user: { 
        ...result.user, 
        companyName: result.tenant.name 
      } 
    };
  }

  // --- CASE 2: Verify for already-in-DB user ---
  if (!userId) throw new AppError('Invalid verification request.', 400);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (user.isEmailVerified) return { alreadyVerified: true };
  if (user.otp !== otpCode || !user.otpExpiry || user.otpExpiry < new Date()) {
    throw new AppError('Invalid or expired verification code.', 400);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true, otp: null, otpExpiry: null },
  });
  return { success: true };
};

/**
 * Forgot Password (Sends OTP to email)
 */
const forgotPassword = async (emailRaw) => {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // We don't throw an error to prevent email enumeration, just return silently
    return;
  }

  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpExpiry }
  });

  try {
    await sendEmail(
      email,
      user.name,
      'Password Reset Request',
      `<p>Hi ${user.name},</p><p>We received a password reset request. Your code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
    );
  } catch (err) {
    console.error('Failed to send reset OTP', err);
  }
};

/**
 * Reset Password (validates OTP and changes password)
 */
const resetPassword = async (emailRaw, otpCode, newPassword) => {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('Invalid request.', 400);

  if (user.otp !== otpCode || !user.otpExpiry || user.otpExpiry < new Date()) {
    throw new AppError('Invalid or expired verification code.', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashedPassword,
      otp: null,
      otpExpiry: null
    }
  });

  return { success: true };
};

/**
 * Resend OTP — works for both email verification AND forgot-password flows.
 * For email verification: caller passes userId (from JWT, no email needed).
 * For forgot password:    caller passes email (not yet authenticated).
 */
const resendOTP = async ({ userId, email: emailRaw, pendingToken }) => {
  // --- Pending Registration resend ---
  if (pendingToken) {
    let payload;
    try { payload = jwt.verify(pendingToken, process.env.JWT_SECRET); } catch { throw new AppError('Link expired. Please register again.', 400); }
    const pending = await prisma.pendingRegistration.findUnique({ where: { id: payload.pendingId } });
    if (!pending) throw new AppError('Registration request not found.', 404);

    // Rate-guard: 60s
    const otp = pending.otpExpiry && pending.otpExpiry > new Date(Date.now() - 60 * 1000)
      ? pending.otp
      : generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const updated = await prisma.pendingRegistration.update({
      where: { id: pending.id }, data: { otp, otpExpiry },
    });

    try {
      await sendEmail(pending.email, pending.name, 'Verify Your Workspace Account',
        `<p>Hi ${pending.name},</p><p>Your new verification code is: <strong>${updated.otp}</strong></p><p>This code expires in 10 minutes.</p>`);
    } catch { throw new AppError('Failed to send email. Please try again.', 500); }

    // Issue fresh pendingToken
    const newPendingToken = jwt.sign(
      { type: 'pending_registration', pendingId: pending.id },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    return { success: true, pendingToken: newPendingToken };
  }

  // --- Existing DB user resend (email verify or forgot password) ---
  let user;
  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found.', 404);
    if (user.isEmailVerified) throw new AppError('Email is already verified.', 400);
  } else if (emailRaw) {
    const email = emailRaw.toLowerCase().trim();
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { success: true }; // silent — prevent enumeration
  } else {
    throw new AppError('User ID or email is required.', 400);
  }

  const otp = user.otpExpiry && user.otpExpiry > new Date(Date.now() - 60 * 1000)
    ? user.otp
    : generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
  user = await prisma.user.findUnique({ where: { id: user.id } });

  const subject = userId ? 'Verify Your Workspace Account' : 'Password Reset Request';
  const body = userId
    ? `<p>Hi ${user.name},</p><p>Your new verification code is: <strong>${user.otp}</strong></p><p>Expires in 10 minutes.</p>`
    : `<p>Hi ${user.name},</p><p>Your new password reset code is: <strong>${user.otp}</strong></p><p>Expires in 10 minutes.</p>`;

  try { await sendEmail(user.email, user.name, subject, body); }
  catch { throw new AppError('Failed to send email. Please try again.', 500); }

  return { success: true };
};

module.exports = { registerTenant, login, verifyEmailOTP, forgotPassword, resetPassword, resendOTP };
