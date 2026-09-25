const { Router } = require("express");
const { authenticate } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/rbac");
const { resolveOwn } = require("../services/auth/scope.service");
const { validate } = require("../validators");
const {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
  addTeamMemberSchema,
  removeTeamMemberSchema,
  userTeamsQuerySchema,
} = require("../validators/user.validator");
const { uploadSpreadsheetMemory } = require("../middlewares/upload");
const userAccountController = require("../controllers/user/user-account.controller");
const userTeamController = require("../controllers/user/user-team.controller");
const userBulkController = require("../controllers/user/user-bulk.controller");

const router = Router();

// ─── USER CRUD & BULK ACTIONS (Admin-only, GLOBAL scope) ────────────

// GET /api/users/bulk-upload/template — Download sample Excel template
router.get(
  "/bulk-upload/template",
  authenticate,
  requirePermission("USER_CREATE"),
  userBulkController.downloadTemplate,
);

// POST /api/users/bulk-upload — Bulk upload users via Excel (.xlsx, .xls) or CSV
router.post(
  "/bulk-upload",
  authenticate,
  requirePermission("USER_CREATE"),
  uploadSpreadsheetMemory.single("file"),
  userBulkController.bulkUploadUsers,
);

// POST /api/users — Create new user account
router.post(
  "/",
  authenticate,
  requirePermission("USER_CREATE"),
  validate(createUserSchema),
  userAccountController.createUser,
);


// GET /api/users — List users (filterable/groupable by department)
router.get(
  "/",
  authenticate,
  requirePermission(["USER_VIEW", "DASHBOARD_VIEW"]),
  validate(listUsersQuerySchema),
  userAccountController.listUsers,
);

// GET /api/users/:userId — User profile drill-in with active memberships
router.get(
  "/:userId",
  authenticate,
  validate(userIdParamSchema),
  requirePermission("USER_VIEW", resolveOwn),
  userAccountController.getUserProfile,
);

// GET /api/users/:userId/performance — User Performance Profile metrics and tickets
router.get(
  "/:userId/performance",
  authenticate,
  validate(userIdParamSchema),
  requirePermission(["USER_PERFORMANCE_VIEW", "USER_VIEW"], resolveOwn),
  userAccountController.getUserPerformance,
);

// PATCH /api/users/:userId — Edit user (Admin GLOBAL, User OWN)
router.patch(
  "/:userId",
  authenticate,
  requirePermission("USER_UPDATE", resolveOwn),
  validate(updateUserSchema),
  userAccountController.updateUser,
);

// DELETE /api/users/:userId — Deactivate user (soft retirement)
router.delete(
  "/:userId",
  authenticate,
  requirePermission("USER_DELETE"),
  validate(userIdParamSchema),
  userAccountController.deactivateUser,
);

// ─── TEAM MEMBERSHIP MANAGEMENT ─────────────────────────────────────

// POST /api/users/:userId/teams — Add user to team
router.post(
  "/:userId/teams",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(addTeamMemberSchema),
  userTeamController.addUserTeam,
);

// DELETE /api/users/:userId/teams/:teamId — Remove user from team (soft-remove)
router.delete(
  "/:userId/teams/:teamId",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(removeTeamMemberSchema),
  userTeamController.removeUserTeam,
);

// GET /api/users/:userId/teams — View user's team memberships (requires USER_VIEW)
router.get(
  "/:userId/teams",
  authenticate,
  validate(userTeamsQuerySchema),
  requirePermission("USER_VIEW", resolveOwn),
  userTeamController.getUserTeams,
);

module.exports = router;
