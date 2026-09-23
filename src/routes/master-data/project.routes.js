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
} = require("../../validators/master-data/project.validator");
const {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  retireProject,
} = require("../../controllers/master-data/project.controller");

const router = Router();

// POST /api/projects — Admin only (GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("PROJECT_CREATE", resolveGlobal),
  validate(createProjectSchema),
  createProject,
);

// GET /api/projects — Gated on PROJECT_VIEW or DASHBOARD_VIEW permission key
router.get(
  "/",
  authenticate,
  requirePermissionKey(["PROJECT_VIEW", "DASHBOARD_VIEW"]),
  validate(projectQuerySchema),
  listProjects,
);

// GET /api/projects/:id — Gated on PROJECT_VIEW permission key
router.get(
  "/:id",
  authenticate,
  requirePermissionKey("PROJECT_VIEW"),
  validate(projectIdParamSchema),
  getProjectById,
);

// PATCH /api/projects/:id — Admin only (GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("PROJECT_UPDATE", resolveGlobal),
  validate(updateProjectSchema),
  updateProject,
);

// DELETE /api/projects/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("PROJECT_DELETE", resolveGlobal),
  validate(projectIdParamSchema),
  retireProject,
);

module.exports = router;
