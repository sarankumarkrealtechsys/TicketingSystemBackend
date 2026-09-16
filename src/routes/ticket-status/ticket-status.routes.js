const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createTicketStatusSchema,
  updateTicketStatusSchema,
  ticketStatusIdParamSchema,
  ticketStatusQuerySchema,
} = require("../../validators/ticket-status/ticket-status.validator");
const ticketStatusController = require("../../controllers/ticket-status/ticket-status.controller");

const router = Router();

// POST /api/ticket-statuses — STATUS_CREATE: Admin (GLOBAL) or User (TEAM scope with active membership check in service)
router.post(
  "/",
  authenticate,
  requirePermissionKey("STATUS_CREATE"),
  validate(createTicketStatusSchema),
  ticketStatusController.createTicketStatus,
);

// GET /api/ticket-statuses — Authenticated users (dropdown consumption for Phase 6)
router.get(
  "/",
  authenticate,
  validate(ticketStatusQuerySchema),
  ticketStatusController.listTicketStatuses,
);

// GET /api/ticket-statuses/:id — Authenticated users (single record fetch)
router.get(
  "/:id",
  authenticate,
  validate(ticketStatusIdParamSchema),
  ticketStatusController.getTicketStatusById,
);

// PATCH /api/ticket-statuses/:id — Admin only (STATUS_UPDATE at GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("STATUS_UPDATE", resolveGlobal),
  validate(updateTicketStatusSchema),
  ticketStatusController.updateTicketStatus,
);

// DELETE /api/ticket-statuses/:id — Soft-delete (retire), Admin only (STATUS_RETIRE at GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("STATUS_RETIRE", resolveGlobal),
  validate(ticketStatusIdParamSchema),
  ticketStatusController.retireTicketStatus,
);

module.exports = router;
