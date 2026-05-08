const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const prisma = require('../lib/prisma');

/**
 * Middleware to authenticate requests via JWT
 * Extracts { userId, tenantId, role } and attaches to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Get token and check if it exists
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists (Optional but recommended for robust security)
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { tenant: true, customRole: true }
    });

    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // 4. Attach user and tenant info to request
    // IMPORTANT: Every query should use req.user.tenantId
    req.user = {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      tenantId: currentUser.tenantId,
      tenantName: currentUser.tenant.name,
      workspaceId: currentUser.workspaceId,
      customRoleId: currentUser.customRoleId,
      permissions: currentUser.customRole ? currentUser.customRole.permissions : {},
      isEmailVerified: currentUser.isEmailVerified,
      createdAt: currentUser.createdAt
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again!', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Your token has expired. Please log in again!', 401));
    }
    next(error);
  }
};

/**
 * Middleware factory to restrict access by Role
 * @param  {...string} roles - e.g. 'ADMIN', 'EMPLOYEE'
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

module.exports = { authenticate, restrictTo };
