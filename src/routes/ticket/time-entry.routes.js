const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { validate } = require("../../validators");
const {
  userTimeSummaryQuerySchema,
} = require("../../validators/ticket/time-entry.validator");
const timeEntryController = require("../../controllers/ticket/time-entry.controller");

const router = Router();

/**
 * Scope resolver for DASHBOARD_VIEW (OWN scope).
 * Admin (GLOBAL scope) automatically short-circuits in requirePermission.
 * Standard user must be querying their own user-summary (req.user.id).
 */
const resolveOwnDashboardView = (user, _resource, req) => {
  return Boolean(user?.id && req?.user?.id && user.id === req.user.id);
};

// GET /api/time-entries/user-summary — Authenticated caller's own time summary
// Strictly derives target user from req.user.id, gated by DASHBOARD_VIEW (Admin: GLOBAL, User: OWN)
router.get(
  "/user-summary",
  authenticate,
  requirePermission("DASHBOARD_VIEW", resolveOwnDashboardView),
  validate(userTimeSummaryQuerySchema),
  timeEntryController.getUserTimeSummary,
);

module.exports = router;
