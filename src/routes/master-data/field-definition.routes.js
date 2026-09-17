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
} = require("../../validators/master-data/field-definition.validator");
const {
  createFieldDefinition,
  listFieldDefinitions,
  getFieldDefinitionById,
  updateFieldDefinition,
  retireFieldDefinition,
} = require("../../controllers/master-data/field-definition.controller");

const router = Router();

// POST /api/ticket-fields — Admin only (TICKET_FIELD_MANAGE at GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(createFieldDefinitionSchema),
  createFieldDefinition,
);

// GET /api/ticket-fields — Authenticated users
router.get(
  "/",
  authenticate,
  validate(fieldDefinitionQuerySchema),
  listFieldDefinitions,
);

// GET /api/ticket-fields/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(fieldDefinitionIdParamSchema),
  getFieldDefinitionById,
);

// PATCH /api/ticket-fields/:id — Admin only (TICKET_FIELD_MANAGE at GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(updateFieldDefinitionSchema),
  updateFieldDefinition,
);

// DELETE /api/ticket-fields/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("TICKET_FIELD_MANAGE", resolveGlobal),
  validate(fieldDefinitionIdParamSchema),
  retireFieldDefinition,
);

module.exports = router;
