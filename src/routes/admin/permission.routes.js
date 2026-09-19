const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { listPermissions } = require("../../controllers/admin/role.controller");

const router = Router();

// GET /api/permissions - list all system permissions (requires authentication)
router.get("/", authenticate, listPermissions);

module.exports = router;
