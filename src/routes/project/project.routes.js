const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  projectQuerySchema,
} = require("../../validators/project/project.validator");
const projectController = require("../../controllers/project/project.controller");

const router = Router();

// POST /api/projects — Admin only (GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("PROJECT_CREATE", resolveGlobal),
  validate(createProjectSchema),
  projectController.createProject,
);

// GET /api/projects — Gated on PROJECT_VIEW permission key (TEAM or GLOBAL scope)
router.get(
  "/",
  authenticate,
  requirePermissionKey("PROJECT_VIEW"),
  validate(projectQuerySchema),
  projectController.listProjects,
);

// GET /api/projects/:id — Gated on PROJECT_VIEW permission key
router.get(
  "/:id",
  authenticate,
  requirePermissionKey("PROJECT_VIEW"),
  validate(projectIdParamSchema),
  projectController.getProjectById,
);

// PATCH /api/projects/:id — Admin only (GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("PROJECT_UPDATE", resolveGlobal),
  validate(updateProjectSchema),
  projectController.updateProject,
);

// DELETE /api/projects/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("PROJECT_DELETE", resolveGlobal),
  validate(projectIdParamSchema),
  projectController.retireProject,
);

module.exports = router;
