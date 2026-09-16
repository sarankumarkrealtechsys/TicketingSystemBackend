const { Router } = require("express");
const { validate } = require("../../validators");
const { loginSchema } = require("../../validators/auth/auth.validator");
const {
  login,
  getMe,
  logout,
} = require("../../controllers/auth/auth.controller");
const { authenticate } = require("../../middlewares/auth");

const router = Router();

// POST /api/auth/login
router.post("/login", validate(loginSchema), login);

// GET /api/auth/me (requires authentication)
router.get("/me", authenticate, getMe);

// POST /api/auth/logout (requires authentication)
router.post("/logout", authenticate, logout);

module.exports = router;
