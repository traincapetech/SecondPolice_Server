const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

const { sendEmail } = require('../utils/emailService');

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
 * Register a new Tenant AND the initial ADMIN user
 */
const registerTenant = async (data) => {
  const { companyName, name, password } = data;
  const email = data.email.toLowerCase().trim();

  // 1. Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('An account with this email already exists.', 400);
  }

  // 2. Hash password & Generate OTP
  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // 3. Database Transaction: Create Tenant + Admin User
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: companyName }
    });

    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        role: 'ADMIN',
        tenantId: tenant.id,
        otp,
        otpExpiry,
        isEmailVerified: false
      }
    });

    return { user, tenant };
  });

  // 4. Send Email
  try {
    await sendEmail(
      email,
      name,
      'Verify Your Workspace Account',
      `<p>Hi ${name},</p><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
    );
  } catch (err) {
    console.error('Failed to send OTP during registration', err);
  }

  const token = signToken(result.user.id, result.tenant.id, result.user.role);

  return { token, user: result.user, tenant: result.tenant };
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

  // 2. Sign token
  const token = signToken(user.id, user.tenantId, user.role);

  return { token, user };
};

/**
 * OTP Verification Logic
 */
const verifyEmailOTP = async (userId, otpCode) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  if (user.isEmailVerified) return { alreadyVerified: true };

  if (user.otp !== otpCode || !user.otpExpiry || user.otpExpiry < new Date()) {
    throw new AppError('Invalid or expired verification code.', 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isEmailVerified: true,
      otp: null,
      otpExpiry: null
    }
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
const resendOTP = async ({ userId, email: emailRaw }) => {
  let user;

  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found.', 404);
    if (user.isEmailVerified) throw new AppError('Email is already verified.', 400);
  } else if (emailRaw) {
    const email = emailRaw.toLowerCase().trim();
    user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return { success: true };
  } else {
    throw new AppError('User ID or email is required.', 400);
  }

  // Rate-guard: don't let them spam within 60 seconds
  if (user.otpExpiry && user.otpExpiry > new Date(Date.now() - 60 * 1000)) {
    // OTP was generated less than 60s ago — still valid, just resend it
    // (we don't regenerate, just re-email the same code)
  } else {
    // Generate a fresh OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
    user = await prisma.user.findUnique({ where: { id: user.id } });
  }

  const subject = userId ? 'Verify Your Workspace Account' : 'Password Reset Request';
  const body = userId
    ? `<p>Hi ${user.name},</p><p>Your new verification code is: <strong>${user.otp}</strong></p><p>This code expires in 10 minutes.</p>`
    : `<p>Hi ${user.name},</p><p>Your new password reset code is: <strong>${user.otp}</strong></p><p>This code expires in 10 minutes.</p>`;

  try {
    await sendEmail(user.email, user.name, subject, body);
  } catch (err) {
    console.error('Failed to resend OTP:', err);
    throw new AppError('Failed to send email. Please try again.', 500);
  }

  return { success: true };
};

module.exports = { registerTenant, login, verifyEmailOTP, forgotPassword, resetPassword, resendOTP };
