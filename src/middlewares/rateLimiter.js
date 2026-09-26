const rateLimit = require("express-rate-limit");

const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Global API rate limiter.
 * Applies to all /api routes.
 * In development: 5000 requests per 15 minutes to allow rapid refreshing & multi-query dashboards.
 * In production: 2000 requests per 15 minutes per IP.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 5000 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  // Never rate-limit auth verification checks so session bootstrap never fails
  skip: (req) => req.path === "/auth/me" || req.originalUrl?.includes("/api/auth/me"),
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

/**
 * Login-specific rate limiter.
 * Protects /api/auth/login against automated credential stuffing and brute-force attacks.
 * In development: 50 attempts per 15 minutes.
 * In production: 10 attempts per 15 minutes per IP.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many login attempts. Please try again after 15 minutes.",
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
