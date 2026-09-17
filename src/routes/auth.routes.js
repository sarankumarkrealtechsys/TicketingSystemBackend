const { Router } = require("express");
const { validate } = require("../validators");
const { loginSchema } = require("../validators/auth.validator");
const {
  login,
  getMe,
  logout,
} = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares/auth");
const { loginRateLimiter } = require("../middlewares/rateLimiter");

const router = Router();

// POST /api/auth/login (brute-force protected)
router.post("/login", loginRateLimiter, validate(loginSchema), login);

// GET /api/auth/me (requires authentication)
router.get("/me", authenticate, getMe);

// POST /api/auth/logout (requires authentication)
router.post("/logout", authenticate, logout);

module.exports = router;
