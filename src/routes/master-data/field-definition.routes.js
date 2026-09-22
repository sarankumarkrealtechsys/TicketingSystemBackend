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

const { prisma } = require("../../lib/prisma");

const resolveFieldDefinitionCreate = async (user, resource, req) => {
  const targetTeamId = req.body?.teamId ? Number(req.body.teamId) : null;
  if (!targetTeamId) {
    return !!req.isGlobalScope;
  }
  const activeMembership = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId: targetTeamId,
      removedAt: null,
    },
  });
  return !!activeMembership;
};

// POST /api/ticket-fields — Admin (GLOBAL) or Team Creators (scoped to their team)
router.post(
  "/",
  authenticate,
  requirePermission(
    ["TICKET_FIELD_MANAGE", "TICKET_CREATE"],
    resolveFieldDefinitionCreate,
  ),
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
