const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { validate } = require("../../validators");
const {
  auditLogQuerySchema,
} = require("../../validators/admin/audit-log.validator");
const auditLogController = require("../../controllers/admin/audit-log.controller");

const router = Router();

// GET /api/admin/audit-logs
// Gated by TICKET_HISTORY_VIEW without scope resolver (only GLOBAL scope passes → Admin only)
router.get(
  "/",
  authenticate,
  requirePermission("TICKET_HISTORY_VIEW"),
  validate(auditLogQuerySchema),
  auditLogController.listAuditLogs,
);

module.exports = router;
