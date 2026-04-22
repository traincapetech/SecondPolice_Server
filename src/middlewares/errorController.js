const AppError = require('../utils/appError');

/**
 * Handle Prisma Unique Constraint Errors (P2002)
 */
const handlePrismaDuplicateFieldsDB = (err) => {
  const target = err.meta?.target;
  const message = `Duplicate value for field: ${target || 'unknown'}. Please use another value!`;
  return new AppError(message, 400);
};

/**
 * Handle Prisma Record Not Found (P2025)
 */
const handlePrismaRecordNotFound = () => {
  return new AppError('No record found with that ID.', 404);
};

/**
 * Handle JWT Invalid Token Error
 */
const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

/**
 * Handle JWT Token Expired Error
 */
const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

/**
 * Development Error Response: Detailed
 */
const sendErrorDev = (err, req, res) => {
  return res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

/**
 * Production Error Response: Simplified
 */
const sendErrorProd = (err, req, res) => {
  // A) Operational, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }

  // B) Programming or other unknown error: don't leak error details
  console.error('ERROR 💥', err);
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!'
  });
};

module.exports = (err, req, res, next) => {
  console.error('DEBUG ERROR:', err);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle Specific Errors
    if (error.code === 'P2002') error = handlePrismaDuplicateFieldsDB(error);
    if (error.code === 'P2025') error = handlePrismaRecordNotFound();
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
