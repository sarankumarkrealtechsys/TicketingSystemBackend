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
} = require("../../validators/department/department.validator");
const departmentController = require("../../controllers/department/department.controller");

const router = Router();

// POST /api/departments — Admin only (GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("DEPARTMENT_CREATE", resolveGlobal),
  validate(createDepartmentSchema),
  departmentController.createDepartment,
);

// GET /api/departments — Gated on DEPARTMENT_VIEW permission key (OWN or GLOBAL scope)
router.get(
  "/",
  authenticate,
  requirePermissionKey("DEPARTMENT_VIEW"),
  validate(departmentQuerySchema),
  departmentController.listDepartments,
);

// GET /api/departments/:id — Gated on DEPARTMENT_VIEW permission key
router.get(
  "/:id",
  authenticate,
  requirePermissionKey("DEPARTMENT_VIEW"),
  validate(departmentIdParamSchema),
  departmentController.getDepartmentById,
);

// PATCH /api/departments/:id — Admin only (GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_UPDATE", resolveGlobal),
  validate(updateDepartmentSchema),
  departmentController.updateDepartment,
);

// DELETE /api/departments/:id — Soft-delete (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("DEPARTMENT_DELETE", resolveGlobal),
  validate(departmentIdParamSchema),
  departmentController.retireDepartment,
);

module.exports = router;
