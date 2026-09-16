const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createPrioritySchema,
  updatePrioritySchema,
  priorityIdParamSchema,
  priorityQuerySchema,
} = require("../../validators/priority/priority.validator");
const priorityController = require("../../controllers/priority/priority.controller");

const router = Router();

// POST /api/priority-levels — Admin only (PRIORITY_MANAGE at GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("PRIORITY_MANAGE", resolveGlobal),
  validate(createPrioritySchema),
  priorityController.createPriority,
);

// GET /api/priority-levels — Authenticated users (dropdown consumption for Phase 6)
router.get(
  "/",
  authenticate,
  validate(priorityQuerySchema),
  priorityController.listPriorities,
);

// GET /api/priority-levels/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(priorityIdParamSchema),
  priorityController.getPriorityById,
);

// PATCH /api/priority-levels/:id — Admin only (PRIORITY_MANAGE at GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("PRIORITY_MANAGE", resolveGlobal),
  validate(updatePrioritySchema),
  priorityController.updatePriority,
);

// DELETE /api/priority-levels/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("PRIORITY_MANAGE", resolveGlobal),
  validate(priorityIdParamSchema),
  priorityController.retirePriority,
);

module.exports = router;
