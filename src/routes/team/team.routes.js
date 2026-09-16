const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const {
  resolveGlobal,
  resolveTeam,
} = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  teamIdParamSchema,
  createTeamSchema,
  updateTeamSchema,
  teamParamIdSchema,
  teamQuerySchema,
} = require("../../validators/team/team.validator");
const teamController = require("../../controllers/team/team.controller");

const router = Router();

// Middleware to tag req.resource for TEAM-scoped checks on single team routes
const setTeamResource = (req, _res, next) => {
  const teamId = Number(req.params.id);
  req.resource = {
    id: teamId,
    teamId,
    entityType: "Team",
  };
  next();
};

// ─── Phase 4 Assignee Endpoint (Untouched) ────────────────────────────
// GET /api/teams/:teamId/assignees — Assignee dropdown candidates matching team's department
router.get(
  "/:teamId/assignees",
  authenticate,
  validate(teamIdParamSchema),
  teamController.getTeamAssignees,
);

// ─── Phase 5 Team CRUD Endpoints ──────────────────────────────────────

// POST /api/teams — Create new Team (Admin only, GLOBAL scope)
router.post(
  "/",
  authenticate,
  requirePermission("TEAM_CREATE", resolveGlobal),
  validate(createTeamSchema),
  teamController.createTeam,
);

// GET /api/teams — List teams (GLOBAL sees all; TEAM-scoped sees own active teams)
router.get(
  "/",
  authenticate,
  requirePermissionKey("TEAM_VIEW"),
  validate(teamQuerySchema),
  teamController.listTeams,
);

// GET /api/teams/:id — View single team (GLOBAL sees all; TEAM sees if active member)
router.get(
  "/:id",
  authenticate,
  validate(teamParamIdSchema),
  setTeamResource,
  requirePermission("TEAM_VIEW", resolveTeam),
  teamController.getTeamById,
);

// PATCH /api/teams/:id — Edit team (Admin only, GLOBAL scope)
router.patch(
  "/:id",
  authenticate,
  requirePermission("TEAM_UPDATE", resolveGlobal),
  validate(updateTeamSchema),
  teamController.updateTeam,
);

// DELETE /api/teams/:id — Soft-delete team (retire), Admin only (GLOBAL scope)
router.delete(
  "/:id",
  authenticate,
  requirePermission("TEAM_DELETE", resolveGlobal),
  validate(teamParamIdSchema),
  teamController.retireTeam,
);

module.exports = router;
