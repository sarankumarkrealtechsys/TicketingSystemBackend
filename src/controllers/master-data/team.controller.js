const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { getPermissions } = require("../../services/auth/permission.service");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

// ============================================================================
// TEAM CONTROLLER (Direct DB Operations with Redis Caching)
// ============================================================================

const createTeam = async (req, res, next) => {
  try {
    const { name, description, teamAdminEmail, departmentId, status } = req.body;
    const adminUserId = req.user.id;

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new AppError("Department not found", 404);
    }
    if (department.status !== "ACTIVE") {
      throw new AppError("Cannot create team in an inactive department", 400);
    }

    const existingTeamInDept = await prisma.team.findFirst({
      where: { departmentId, name },
    });
    if (existingTeamInDept) {
      throw new AppError("A team with this name already exists in this department", 400);
    }

    try {
      const data = await prisma.team.create({
        data: {
          name,
          description: description || null,
          teamAdminEmail,
          departmentId,
          status: status || "ACTIVE",
          createdById: adminUserId,
        },
        include: {
          department: { select: { id: true, name: true } },
          _count: {
            select: {
              members: { where: { removedAt: null } },
              tickets: true,
            },
          },
        },
      });

      await invalidateCachePattern("masterdata:teams:*");

      return res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A team with this name already exists in this department", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const listTeams = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TEAM_VIEW"]?.includes("GLOBAL");

    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === true;

    const where = {};

    if (!isGlobalScope && req.user?.id) {
      where.members = {
        some: {
          userId: req.user.id,
          removedAt: null,
        },
      };
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (!includeInactive) {
      where.status = "ACTIVE";
    }

    const queryStr = serializeQueryParams(req.query);
    const cacheKey = isGlobalScope
      ? `masterdata:teams:global:${queryStr}`
      : `masterdata:teams:user:${req.user.id}:${queryStr}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.team.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          _count: {
            select: {
              members: { where: { removedAt: null } },
              tickets: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    );

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
    const id = Number(req.params.id);
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        members: {
          where: { removedAt: null },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
                departmentId: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: { where: { removedAt: null } },
            tickets: true,
          },
        },
      },
    });

    if (!team) {
      throw new AppError("Team not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: team,
    });
  } catch (error) {
    next(error);
  }
};

const updateTeam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, teamAdminEmail, departmentId, status } = req.body;

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Team not found", 404);
    }

    if (departmentId && departmentId !== existing.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) {
        throw new AppError("Department not found", 404);
      }
      if (department.status !== "ACTIVE") {
        throw new AppError("Cannot move team to an inactive department", 400);
      }
    }

    const targetDeptId = departmentId || existing.departmentId;
    if (name && (name !== existing.name || departmentId !== undefined)) {
      const duplicate = await prisma.team.findFirst({
        where: {
          departmentId: targetDeptId,
          name,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new AppError("A team with this name already exists in this department", 400);
      }
    }

    try {
      const data = await prisma.team.update({
        where: { id },
        data: {
          name: name !== undefined ? name : undefined,
          description: description !== undefined ? description : undefined,
          teamAdminEmail: teamAdminEmail !== undefined ? teamAdminEmail : undefined,
          departmentId: departmentId !== undefined ? departmentId : undefined,
          status: status !== undefined ? status : undefined,
        },
        include: {
          department: { select: { id: true, name: true } },
          _count: {
            select: {
              members: { where: { removedAt: null } },
              tickets: true,
            },
          },
        },
      });

      await invalidateCachePattern("masterdata:teams:*");

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A team with this name already exists in this department", 400);
      }

      if (
        error.message?.includes("Cannot change department for team") ||
        error.message?.includes("prevent_team_department_change") ||
        error.message?.includes("fn_prevent_team_department_change")
      ) {
        throw new AppError(
          "Cannot change department for team — it has existing tickets, assignments, or memberships",
          400,
        );
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const retireTeam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Team not found", 404);
    }

    const data = await prisma.team.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await invalidateCachePattern("masterdata:teams:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getTeamAssignees = async (req, res, next) => {
  try {
    const teamId = Number(req.params.teamId);

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new AppError("Team not found", 404);
    }

    const assignees = await prisma.user.findMany({
      where: {
        departmentId: team.departmentId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        departmentId: true,
        roleId: true,
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return res.status(200).json({
      status: "success",
      data: {
        teamId: team.id,
        teamName: team.name,
        departmentId: team.departmentId,
        assignees: assignees.map((a) => ({
          ...a,
          role: a.userRole,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  retireTeam,
  getTeamAssignees,
};
