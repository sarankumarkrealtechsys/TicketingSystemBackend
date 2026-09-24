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
      where: {
        departmentId,
        name: { equals: name.trim(), mode: "insensitive" },
      },
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
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === true;
    const myTeamsOnly = req.query.myTeamsOnly === "true" || req.query.myTeamsOnly === true;

    const where = {};

    if (myTeamsOnly && req.user?.id) {
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
    const cacheKey = myTeamsOnly && req.user?.id
      ? `masterdata:teams:user:${req.user.id}:${queryStr}`
      : `masterdata:teams:all:${queryStr}`;

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

    const isDeptChange = departmentId !== undefined && departmentId !== existing.departmentId;
    const isOtherFieldsUpdate = name !== undefined || description !== undefined || teamAdminEmail !== undefined || (status !== undefined && status !== existing.status);

    if (isDeptChange || isOtherFieldsUpdate) {
      const userPermissions = await getPermissions(req.user, req);

      if (isDeptChange) {
        const canChangeDept = userPermissions["TEAM_DEPARTMENT_CHANGE"]?.includes("GLOBAL") || userPermissions["TEAM_UPDATE"]?.includes("GLOBAL");
        if (!canChangeDept) {
          throw new AppError("You do not have permission to change a team's department", 403);
        }
      }

      if (isOtherFieldsUpdate) {
        const canUpdate = userPermissions["TEAM_UPDATE"]?.includes("GLOBAL");
        if (!canUpdate) {
          throw new AppError("You do not have permission to update team details", 403);
        }
      }
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
    if (name && (name.trim().toLowerCase() !== existing.name.toLowerCase() || departmentId !== undefined)) {
      const duplicate = await prisma.team.findFirst({
        where: {
          departmentId: targetDeptId,
          name: { equals: name.trim(), mode: "insensitive" },
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
    const permanent = req.query.permanent === "true" || req.query.permanent === true;

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Team not found", 404);
    }

    let data;
    if (permanent) {
      const [ticketsCount, membersCount] = await Promise.all([
        prisma.ticket.count({ where: { teamId: id } }),
        prisma.userTeam.count({ where: { teamId: id, removedAt: null } }),
      ]);

      if (ticketsCount > 0 || membersCount > 0) {
        const reasons = [];
        if (ticketsCount > 0) reasons.push(`${ticketsCount} ticket(s)`);
        if (membersCount > 0) reasons.push(`${membersCount} active member(s)`);
        throw new AppError(
          `Cannot permanently delete team because it has ${reasons.join(" and ")} associated with it. Please archive the team instead.`,
          400
        );
      }

      await prisma.userTeam.deleteMany({ where: { teamId: id } });
      data = await prisma.team.delete({ where: { id } });
    } else {
      data = await prisma.team.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
    }

    await invalidateCachePattern("masterdata:teams:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    const isForeignKeyViolation =
      error.code === "P2003" ||
      error.code === "23001" ||
      (typeof error.message === "string" &&
        (error.message.includes("violates RESTRICT") ||
          error.message.includes("foreign key constraint") ||
          error.message.includes("Foreign key constraint failed")));

    if (isForeignKeyViolation) {
      return next(
        new AppError(
          "Cannot permanently delete team because it has associated tickets or personnel. Please archive it instead.",
          400
        )
      );
    }
    next(error);
  }
};


const getTeamAssignees = async (req, res, next) => {
  try {
    const teamId = Number(req.params.teamId);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
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
                roleId: true,
                status: true,
                department: { select: { id: true, name: true } },
                userRole: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!team) {
      throw new AppError("Team not found", 404);
    }

    const assignees = team.members
      .filter((m) => m.user && m.user.status === "ACTIVE")
      .map((m) => ({
        ...m.user,
        role: m.user.userRole,
      }));

    return res.status(200).json({
      status: "success",
      data: {
        teamId: team.id,
        teamName: team.name,
        departmentId: team.departmentId,
        assignees,
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
