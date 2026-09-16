const teamService = require("../../services/team/team.service");
const { getPermissions } = require("../../services/auth/permission.service");

/**
 * Controller for Team endpoints
 */
const getTeamAssignees = async (req, res, next) => {
  try {
    const data = await teamService.getTeamAssignees(req.params.teamId);
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const createTeam = async (req, res, next) => {
  try {
    const data = await teamService.createTeam(req.body, req.user.id);
    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const listTeams = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TEAM_VIEW"]?.includes("GLOBAL");

    const data = await teamService.listTeams({
      departmentId: req.query.departmentId
        ? Number(req.query.departmentId)
        : undefined,
      includeInactive:
        req.query.includeInactive === "true" ||
        req.query.includeInactive === true,
      user: req.user,
      isGlobalScope,
    });

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getTeamById = async (req, res, next) => {
  try {
    const data = await teamService.getTeamById(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updateTeam = async (req, res, next) => {
  try {
    const data = await teamService.updateTeam(
      Number(req.params.id),
      req.body,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const retireTeam = async (req, res, next) => {
  try {
    const data = await teamService.retireTeam(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeamAssignees,
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  retireTeam,
};
