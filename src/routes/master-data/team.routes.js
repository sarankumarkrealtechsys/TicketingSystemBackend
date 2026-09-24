const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission, requirePermissionKey } = require("../../middlewares/rbac");
const {
  resolveGlobal,
  resolveTeam,
} = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createTeamSchema,
  updateTeamSchema,
  teamParamIdSchema,
  teamIdParamSchema,
  teamQuerySchema,
  bulkAddTeamMembersSchema,
  bulkRemoveTeamMembersSchema,
} = require("../../validators/master-data/team.validator");
const {
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  retireTeam,
  getTeamAssignees,
} = require("../../controllers/master-data/team.controller");
const {
  bulkAddUserTeams,
  bulkRemoveUserTeams,
} = require("../../controllers/user/user-team.controller");

const router = Router();

// Middleware to tag req.resource for TEAM-scoped checks on single team routes
const setTeamResource = (req, _res, next) => {
  const teamId = Number(req.params.teamId || req.params.id);
  req.resource = {
    id: teamId,
    teamId,
    entityType: "Team",
  };
  next();
};

// GET /api/teams/:teamId/assignees — Assignee candidates matching team's department
router.get(
  "/:teamId/assignees",
  authenticate,
  validate(teamIdParamSchema),
  setTeamResource,
  requirePermissionKey(["TEAM_VIEW", "DASHBOARD_VIEW", "TICKET_CREATE"]),
  getTeamAssignees,
);

// POST /api/teams/:teamId/members/bulk — Add multiple members to team
router.post(
  "/:teamId/members/bulk",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(bulkAddTeamMembersSchema),
  bulkAddUserTeams,
);

// POST /api/teams/:teamId/members/bulk-remove — Remove multiple members from team
router.post(
  "/:teamId/members/bulk-remove",
  authenticate,
  requirePermission("TEAM_MEMBERSHIP_MANAGE"),
  validate(bulkRemoveTeamMembersSchema),
  bulkRemoveUserTeams,
);

// POST /api/teams — Create new Team (Admin only, GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("TEAM_CREATE", resolveGlobal),
  validate(createTeamSchema),
  createTeam,
);

// GET /api/teams — List teams (supports myTeamsOnly query filter)
router.get(
  "/",
  authenticate,
  requirePermissionKey(["TEAM_VIEW", "DASHBOARD_VIEW", "TICKET_CREATE"]),
  validate(teamQuerySchema),
  listTeams,
);

// GET /api/teams/:id — View single team
router.get(
  "/:id",
  authenticate,
  validate(teamParamIdSchema),
  setTeamResource,
  requirePermissionKey(["TEAM_VIEW", "DASHBOARD_VIEW", "TICKET_CREATE"]),
  getTeamById,
);

// PATCH /api/teams/:id — Edit team (Admin only, GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermissionKey(["TEAM_UPDATE", "TEAM_DEPARTMENT_CHANGE"]),
  validate(updateTeamSchema),
  updateTeam,
);

// DELETE /api/teams/:id — Soft-delete team (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("TEAM_DELETE", resolveGlobal),
  validate(teamParamIdSchema),
  retireTeam,
);

module.exports = router;
