const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { resolveOwn } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
} = require("../../validators/user/user.validator");
const {
  addTeamMemberSchema,
  removeTeamMemberSchema,
  userTeamsQuerySchema,
} = require("../../validators/team/team.validator");
const userController = require("../../controllers/user/user.controller");

const router = Router();

// ─── USER CRUD (Admin-only, GLOBAL scope) ───────────────────────────

// POST /api/users — Create new user account
router.post(
  "/",
  authenticate,
  requirePermission("USER_CREATE"),
  validate(createUserSchema),
  userController.createUser,
);

// GET /api/users — List users (filterable/groupable by department)
router.get(
  "/",
  authenticate,
  requirePermission("USER_VIEW"),
  validate(listUsersQuerySchema),
  userController.listUsers,
);

// GET /api/users/:userId — User profile drill-in with active memberships
router.get(
  "/:userId",
  authenticate,
  validate(userIdParamSchema),
  requirePermission("USER_VIEW", resolveOwn),
  userController.getUserProfile,
);

// PATCH /api/users/:userId — Edit user (Department, Role, Status)
router.patch(
  "/:userId",
  authenticate,
  requirePermission("USER_UPDATE"),
  validate(updateUserSchema),
  userController.updateUser,
);

// DELETE /api/users/:userId — Deactivate user (soft retirement)
router.delete(
  "/:userId",
  authenticate,
  requirePermission("USER_DELETE"),
  validate(userIdParamSchema),
  userController.deactivateUser,
);

// ─── TEAM MEMBERSHIP MANAGEMENT ─────────────────────────────────────

// POST /api/users/:userId/teams — Add user to team
router.post(
  "/:userId/teams",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(addTeamMemberSchema),
  userController.addUserTeam,
);

// DELETE /api/users/:userId/teams/:teamId — Remove user from team (soft-remove)
router.delete(
  "/:userId/teams/:teamId",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(removeTeamMemberSchema),
  userController.removeUserTeam,
);

// GET /api/users/:userId/teams — View user's team memberships (requires USER_VIEW)
router.get(
  "/:userId/teams",
  authenticate,
  validate(userTeamsQuerySchema),
  requirePermission("USER_VIEW", resolveOwn),
  userController.getUserTeams,
);

module.exports = router;
