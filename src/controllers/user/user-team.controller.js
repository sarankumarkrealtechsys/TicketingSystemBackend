const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { invalidateCachePattern } = require("../../utils/cache");

// ============================================================================
// USER TEAM MEMBERSHIP CONTROLLER (Direct DB Operations)
// ============================================================================

const userTeamService = require("../../services/user/user-team.service");

const addUserTeam = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const teamId = Number(req.body.teamId);
    const adminUserId = req.user.id;

    const membership = await userTeamService.addUserTeam({
      userId,
      teamId,
      adminUserId,
    });

    await invalidateCachePattern("masterdata:teams:*");

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
    const userId = Number(req.params.userId);
    const teamId = Number(req.params.teamId);
    const adminUserId = req.user.id;

    const updatedMembership = await userTeamService.removeUserTeam({
      userId,
      teamId,
      adminUserId,
    });

    await invalidateCachePattern("masterdata:teams:*");

    return res.status(200).json({
      status: "success",
      message: "Team membership removed successfully",
      data: { membership: updatedMembership },
    });
  } catch (error) {
    next(error);
  }
};

const getUserTeams = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const includeHistory = req.query.includeHistory === "true" || req.query.includeHistory === true;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const where = { userId };
    if (!includeHistory) {
      where.removedAt = null;
    }

    const memberships = await prisma.userTeam.findMany({
      where,
      include: {
        team: {
          select: {
            id: true,
            name: true,
            departmentId: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return res.status(200).json({
      status: "success",
      data: { memberships },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addUserTeam,
  removeUserTeam,
  getUserTeams,
};
