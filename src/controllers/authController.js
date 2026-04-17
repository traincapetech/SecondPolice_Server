const authService = require('../services/authService');
const { registerSchema, loginSchema } = require('../schemas/authSchema');
const AppError = require('../utils/appError');
const prisma = require('../lib/prisma');
const { generateWorkspaceId } = require('../utils/workspaceIdGenerator');

const register = async (req, res, next) => {
  try {
    // 1. Zod Validation
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return next(new AppError(validationResult.error.issues[0].message, 400));
    }

    // 2. Save to PendingRegistration
    const { pendingToken } = await authService.registerTenant(validationResult.data);

    // 3. Return pendingToken — no user/tenant exists in DB yet
    res.status(201).json({
      status: 'success',
      pendingToken,
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    // 1. Zod Validation
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return next(new AppError(validationResult.error.issues[0].message, 400));
    }

    const { email, password } = validationResult.data;

    // 2. Perform Login
    const { token, user } = await authService.login(email, password);

    // 3. Send Response
    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          workspaceId: user.workspaceId,
          companyName: user.companyName,
          tenantId: user.tenantId,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { otp, pendingToken } = req.body;
    if (!otp) return next(new AppError('OTP is required', 400));

    const result = await authService.verifyEmailOTP({
      userId: req.user?.id ?? null,
      otpCode: otp,
      pendingToken: pendingToken ?? null,
    });

    // If completing a pending registration, result includes a real JWT + user
    if (result.token) {
      return res.status(200).json({
        status: 'success',
        token: result.token,
        data: {
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            workspaceId: result.user.workspaceId,
            companyName: result.user.companyName,
            tenantId: result.user.tenantId,
            isEmailVerified: true,
          },
        },
      });
    }

    res.status(200).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required', 400));
    await authService.forgotPassword(email);
    res.status(200).json({ status: 'success', message: 'If an account with that email exists, an OTP has been sent.' });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return next(new AppError('Email, OTP, and new password are required.', 400));
    if (newPassword.length < 8) return next(new AppError('Password must be at least 8 characters.', 400));
    
    await authService.resetPassword(email, otp, newPassword);
    res.status(200).json({ status: 'success', message: 'Password has been safely reset.' });
  } catch (err) { next(err); }
};

/**
 * POST /auth/resend-otp
 * Two use-cases:
 *  - Email verification (authenticated, no body needed): uses req.user.id
 *  - Forgot-password resend (unauthenticated): requires { email } in body
 */
const resendOTP = async (req, res, next) => {
  try {
    const userId = req.user?.id ?? null;
    const email  = req.body?.email ?? null;
    const pendingToken = req.body?.pendingToken ?? null;
    const result = await authService.resendOTP({ userId, email, pendingToken });
    res.status(200).json({
      status: 'success',
      message: 'A new code has been sent to your email.',
      // Return refreshed pendingToken if it was a pending-registration resend
      ...(result.pendingToken ? { pendingToken: result.pendingToken } : {}),
    });
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    // req.user is guaranteed to be hydrated by the authenticate middleware
    // but it might not have the workspaceId if it was just added to the schema
    let user = req.user;

    if (!user.workspaceId || !user.companyName) {
      const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
      const companyName = tenant.name;
      let roleName = user.role;
      if (user.customRoleId) {
        const customRole = await prisma.customRole.findUnique({ where: { id: user.customRoleId } });
        if (customRole) roleName = customRole.name;
      }

      let dataToUpdate = {};
      if (!user.workspaceId) {
        dataToUpdate.workspaceId = await generateWorkspaceId(companyName, roleName);
      }
      
      if (Object.keys(dataToUpdate).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: dataToUpdate,
          include: { customRole: { select: { id: true, name: true } } }
        });
      }
      user.companyName = companyName;
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, verifyOTP, forgotPassword, resetPassword, resendOTP };
