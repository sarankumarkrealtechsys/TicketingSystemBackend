const userService = require("../../services/user/user.service");
const teamService = require("../../services/team/team.service");

/**
 * Controller for User Management and Team Memberships
 */
const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);
    return res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const users = await userService.listUsers(req.query);
    return res.status(200).json({
      status: "success",
      data: { users },
    });
  } catch (error) {
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.userId);
    return res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.userId, req.body);
    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const user = await userService.deactivateUser(req.params.userId);
    return res.status(200).json({
      status: "success",
      message: "User deactivated successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

const addUserTeam = async (req, res, next) => {
  try {
    const membership = await teamService.addTeamMember(
      req.params.userId,
      req.body.teamId,
      req.user.id,
    );
    return res.status(201).json({
      status: "success",
      message: "Team membership added successfully",
      data: { membership },
    });
  } catch (error) {
    next(error);
  }
};

const removeUserTeam = async (req, res, next) => {
  try {
    const membership = await teamService.removeTeamMember(
      req.params.userId,
      req.params.teamId,
      req.user.id,
    );
    return res.status(200).json({
      status: "success",
      message: "Team membership removed successfully",
      data: { membership },
    });
  } catch (error) {
    next(error);
  }
};

const getUserTeams = async (req, res, next) => {
  try {
    const memberships = await teamService.getUserTeamMemberships(
      req.params.userId,
      req.query.includeHistory,
    );
    return res.status(200).json({
      status: "success",
      data: { memberships },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  listUsers,
  getUserProfile,
  updateUser,
  deactivateUser,
  addUserTeam,
  removeUserTeam,
  getUserTeams,
};
