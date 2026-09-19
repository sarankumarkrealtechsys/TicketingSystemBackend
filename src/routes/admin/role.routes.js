const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermissionKey } = require("../../middlewares/rbac");
const {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  updateRolePermissions,
  archiveRole,
  restoreRole,
  deleteRole,
} = require("../../controllers/admin/role.controller");

const router = Router();

// All role endpoints require authentication
router.use(authenticate);

// GET /api/roles - list all roles (accessible to authenticated users for dropdowns / role lists)
router.get("/", listRoles);

// GET /api/roles/:id - get role details
router.get("/:id", getRoleById);

// Protected mutation endpoints require ROLE_MANAGE permission
router.post("/", requirePermissionKey("ROLE_MANAGE"), createRole);
router.put("/:id", requirePermissionKey("ROLE_MANAGE"), updateRole);
router.put("/:id/permissions", requirePermissionKey("ROLE_MANAGE"), updateRolePermissions);
router.patch("/:id/archive", requirePermissionKey("ROLE_MANAGE"), archiveRole);
router.patch("/:id/restore", requirePermissionKey("ROLE_MANAGE"), restoreRole);
router.delete("/:id", requirePermissionKey("ROLE_MANAGE"), deleteRole);

module.exports = router;
