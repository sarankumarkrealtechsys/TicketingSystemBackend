const rateLimit = require("express-rate-limit");

/**
 * Global API rate limiter.
 * Applies to all /api routes.
 * 500 requests per 15 minutes per IP.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

/**
 * Login-specific rate limiter.
 * 10 attempts per IP per 15 minutes to prevent brute-force attacks.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many login attempts, please try again later.",
  },
});

/**
 * File upload rate limiter.
 * 20 uploads per IP per 5 minutes to prevent upload flooding.
 */
const uploadRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 uploads per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many file uploads, please try again later.",
  },
});

module.exports = { apiRateLimiter, loginRateLimiter, uploadRateLimiter };
