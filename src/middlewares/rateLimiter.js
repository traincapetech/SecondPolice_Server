const rateLimit = require('express-rate-limit');

// 1. Global API Limiter: Prevents general DDOS or looping
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 minutes
  message: {
    status: 'error',
    message: 'Too many requests, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// 2. Strict Auth Limiter: Protects login/registration from brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes lockout
  max: 5, // Limit each IP to 5 failed requests per 15 minutes
  skipSuccessfulRequests: true, // If login succeeds (200 OK), DONT count it. Only failures count towards the 5 limit!
  message: {
    status: 'error',
    message: 'Too many failed attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, authLimiter };
