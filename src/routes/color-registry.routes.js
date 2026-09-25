const { Router } = require("express");
const { authenticate } = require("../middlewares/auth");
const {
  getColorRegistry,
  updateColorRegistry,
} = require("../controllers/admin/color-registry.controller");

const router = Router();

// GET /api/color-registry — Authenticated users (any logged-in user can fetch global theme colors)
router.get("/", authenticate, getColorRegistry);

// PUT /api/color-registry — Authenticated users (persisting custom color selections)
router.put("/", authenticate, updateColorRegistry);

module.exports = router;
