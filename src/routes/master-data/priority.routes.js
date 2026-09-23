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
} = require("../../validators/master-data/priority.validator");
const {
  createPriority,
  listPriorities,
  getPriorityById,
  updatePriority,
  retirePriority,
} = require("../../controllers/master-data/priority.controller");

const router = Router();

// POST /api/priority-levels — PRIORITY_CREATE at GLOBAL scope
router.post(
  "/",
  authenticate,
  requirePermission("PRIORITY_CREATE", resolveGlobal),
  validate(createPrioritySchema),
  createPriority,
);

// GET /api/priority-levels — Authenticated users
router.get(
  "/",
  authenticate,
  validate(priorityQuerySchema),
  listPriorities,
);

// GET /api/priority-levels/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(priorityIdParamSchema),
  getPriorityById,
);

// PATCH /api/priority-levels/:id — PRIORITY_UPDATE at GLOBAL scope
router.patch(
  "/:id",
  authenticate,
  requirePermission("PRIORITY_UPDATE", resolveGlobal),
  validate(updatePrioritySchema),
  updatePriority,
);

// DELETE /api/priority-levels/:id — Soft-delete (retire), PRIORITY_RETIRE at GLOBAL scope
router.delete(
  "/:id",
  authenticate,
  requirePermission("PRIORITY_RETIRE", resolveGlobal),
  validate(priorityIdParamSchema),
  retirePriority,
);

module.exports = router;
