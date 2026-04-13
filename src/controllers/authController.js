const authService = require('../services/authService');
const { registerSchema, loginSchema } = require('../schemas/authSchema');
const AppError = require('../utils/appError');

const register = async (req, res, next) => {
  try {
    // 1. Zod Validation
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return next(new AppError(validationResult.error.issues[0].message, 400));
    }

    // 2. Register Tenant + Admin
    const { token, user, tenant } = await authService.registerTenant(validationResult.data);

    // 3. Send Response
    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          isEmailVerified: user.isEmailVerified
        }
      }
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
    const { otp } = req.body;
    if (!otp) return next(new AppError('OTP is required', 400));
    const result = await authService.verifyEmailOTP(req.user.id, otp);
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
    await authService.resendOTP({ userId, email });
    res.status(200).json({ status: 'success', message: 'A new code has been sent to your email.' });
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    // req.user is guaranteed to be hydrated by the authenticate middleware
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user
      } // Exposes name, email, role, and strictly the tenantId/tenantName
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, verifyOTP, forgotPassword, resetPassword, resendOTP };
