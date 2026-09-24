const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentIdParamSchema,
  departmentQuerySchema,
} = require("../../validators/master-data/department.validator");
const {
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  retireDepartment,
} = require("../../controllers/master-data/department.controller");

const router = Router();

// POST /api/departments — Admin only (GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("DEPARTMENT_CREATE", resolveGlobal),
  validate(createDepartmentSchema),
  createDepartment,
);

// GET /api/departments — Accessible to DEPARTMENT_VIEW, TEAM_VIEW, TICKET_CREATE, or DASHBOARD_VIEW
router.get(
  "/",
  authenticate,
  requirePermissionKey(["DEPARTMENT_VIEW", "TEAM_VIEW", "TICKET_CREATE", "DASHBOARD_VIEW"]),
  validate(departmentQuerySchema),
  listDepartments,
);

// GET /api/departments/:id — Accessible to DEPARTMENT_VIEW, TEAM_VIEW, TICKET_CREATE, or DASHBOARD_VIEW
router.get(
  "/:id",
  authenticate,
  requirePermissionKey(["DEPARTMENT_VIEW", "TEAM_VIEW", "TICKET_CREATE", "DASHBOARD_VIEW"]),
  validate(departmentIdParamSchema),
  getDepartmentById,
);

// PATCH /api/departments/:id — Admin only (GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_UPDATE", resolveGlobal),
  validate(updateDepartmentSchema),
  updateDepartment,
);

// DELETE /api/departments/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_DELETE", resolveGlobal),
  validate(departmentIdParamSchema),
  retireDepartment,
);

module.exports = router;
