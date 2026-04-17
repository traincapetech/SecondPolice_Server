const AppError = require('../utils/appError');

/**
 * Middleware factory to enforce Granular Role-Based Access Control (RBAC).
 * It relies on req.user.permissions being populated by authMiddleware.
 * 
 * Access levels:
 * - 'Read-Only': Can perform GET operations.
 * - 'Read & Write': Can perform GET, POST, PUT, DELETE operations.
 * - 'No Access' (or undefined): Rejected.
 * 
 * If the user's base Role is ADMIN, they bypass the granular checks.
 * 
 * @param {string} moduleName - The module to check (e.g., 'dashboard', 'customers', etc.)
 * @param {string} requiredAccess - The minimum access required ('Read-Only' or 'Read & Write')
 */
const requirePermission = (moduleName, requiredAccess = 'Read-Only') => {
  return (req, res, next) => {
    // ADMIN has bypass privileges
    if (req.user.role === 'ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || {};
    const moduleAccess = userPermissions[moduleName];

    // No specific access defined means rejected
    if (!moduleAccess || moduleAccess === 'No Access') {
      return next(new AppError('You do not have permission to access this module', 403));
    }

    // Check if what they have matches what is required
    if (requiredAccess === 'Read & Write' && moduleAccess !== 'Read & Write') {
       return next(new AppError('You do not have write permissions for this module', 403));
    }

    // If we require Read-Only and they have Read & Write or Read-Only, they pass.
    next();
  };
};

module.exports = { requirePermission };
