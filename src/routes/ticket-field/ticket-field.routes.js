const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  fieldDefinitionIdParamSchema,
  fieldDefinitionQuerySchema,
} = require("../../validators/ticket-field/ticket-field.validator");
const ticketFieldController = require("../../controllers/ticket-field/ticket-field.controller");

const router = Router();

// POST /api/ticket-fields — Admin only (TICKET_FIELD_MANAGE at GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(createFieldDefinitionSchema),
  ticketFieldController.createFieldDefinition,
);

// GET /api/ticket-fields — Authenticated users (dropdown & dynamic form rendering)
router.get(
  "/",
  authenticate,
  validate(fieldDefinitionQuerySchema),
  ticketFieldController.listFieldDefinitions,
);

// GET /api/ticket-fields/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(fieldDefinitionIdParamSchema),
  ticketFieldController.getFieldDefinitionById,
);

// PATCH /api/ticket-fields/:id — Admin only (TICKET_FIELD_MANAGE at GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(updateFieldDefinitionSchema),
  ticketFieldController.updateFieldDefinition,
);

// DELETE /api/ticket-fields/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(fieldDefinitionIdParamSchema),
  ticketFieldController.retireFieldDefinition,
);

module.exports = router;
