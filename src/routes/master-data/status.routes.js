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
} = require("../../validators/master-data/status.validator");
const {
  createTicketStatus,
  listTicketStatuses,
  getTicketStatusById,
  updateTicketStatus,
  retireTicketStatus,
} = require("../../controllers/master-data/status.controller");

const router = Router();

// POST /api/ticket-statuses — STATUS_CREATE: Admin (GLOBAL) or User (TEAM scope)
router.post(
  "/",
  authenticate,
  requirePermissionKey("STATUS_CREATE"),
  validate(createTicketStatusSchema),
  createTicketStatus,
);

// GET /api/ticket-statuses — Authenticated users
router.get(
  "/",
  authenticate,
  validate(ticketStatusQuerySchema),
  listTicketStatuses,
);

// GET /api/ticket-statuses/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(ticketStatusIdParamSchema),
  getTicketStatusById,
);

// PATCH /api/ticket-statuses/:id — Admin only (STATUS_UPDATE at GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("STATUS_UPDATE", resolveGlobal),
  validate(updateTicketStatusSchema),
  updateTicketStatus,
);

// DELETE /api/ticket-statuses/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("STATUS_RETIRE", resolveGlobal),
  validate(ticketStatusIdParamSchema),
  retireTicketStatus,
);

module.exports = router;
