const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Team Service (Phase 4 & Phase 5)
 */

/**
 * Adds a user to a team.
 * Gated by TEAM_MEMBERSHIP_MANAGE.
 * Enforces:
 * 1. user.departmentId === team.departmentId
 * 2. Active membership uniqueness (one active membership per user and team)
 * 3. Soft-removal preservation: re-joining after removal creates a new active row
 */
const addTeamMember = async (userId, teamId, adminUserId) => {
  // 1. Verify user existence
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // 2. Verify team existence
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });
  if (!team) {
    throw new AppError("Team not found", 404);
  }

  // 3. Department consistency rule: User can only belong to Teams within their own Department
  if (user.departmentId !== team.departmentId) {
    throw new AppError(
      "Cannot add user to team: user and team must belong to the same department",
      400,
    );
  }

  // 4. Check for existing active membership
  const existingActiveMembership = await prisma.userTeam.findFirst({
    where: {
      userId,
      teamId,
      removedAt: null,
    },
  });
  if (existingActiveMembership) {
    throw new AppError("User is already an active member of this team", 400);
  }

  // 5. Create new membership (rejoin creates a new active row)
  try {
    const membership = await prisma.userTeam.create({
      data: {
        userId,
        teamId,
        addedById: adminUserId,
        joinedAt: new Date(),
        removedAt: null,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            departmentId: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            departmentId: true,
          },
        },
      },
    });

    return membership;
  } catch (error) {
    // Intercept partial unique index uq_user_team_active
    if (
      error.code === "P2002" ||
      error.message?.includes("uq_user_team_active")
    ) {
      throw new AppError("User is already an active member of this team", 400);
    }

    // Intercept trigger fn_validate_user_team_department
    if (error.message?.includes("Cross-department membership not allowed")) {
      throw new AppError(
        "Cannot add user to team: user and team must belong to the same department",
        400,
      );
    }

    throw error;
  }
};

/**
 * Removes a user from a team (soft-remove).
 * Gated by TEAM_MEMBERSHIP_MANAGE.
 * Sets removedAt = now() and retains the historical membership record.
 */
const removeTeamMember = async (userId, teamId, adminUserId) => {
  const activeMembership = await prisma.userTeam.findFirst({
    where: {
      userId,
      teamId,
      removedAt: null,
    },
  });

  if (!activeMembership) {
    throw new AppError(
      "Active team membership not found for this user and team",
      404,
    );
  }

  const updatedMembership = await prisma.userTeam.update({
    where: { id: activeMembership.id },
    data: {
      removedAt: new Date(),
      removedById: adminUserId,
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return updatedMembership;
};

/**
 * Retrieves team memberships for a given user.
 * By default returns active memberships; returns full history if includeHistory is true.
 */
const getUserTeamMemberships = async (userId, includeHistory = false) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const where = { userId };
  if (!includeHistory) {
    where.removedAt = null;
  }

  return prisma.userTeam.findMany({
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
};

/**
 * Assignee candidate dropdown data source for future Phase 6/7 ticket creation/assignment.
 * Enforces: user.departmentId === team.departmentId
 * Excludes inactive users and users from other departments.
 */
const getTeamAssignees = async (teamId) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });
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
      department: {
        select: { id: true, name: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    teamId: team.id,
    teamName: team.name,
    departmentId: team.departmentId,
    assignees: assignees.map((a) => ({
      ...a,
      role: a.userRole,
    })),
  };
};

// ── Phase 5 Team CRUD Methods ──────────────────────────────────────────

/**
 * Creates a new Team.
 * Gated by TEAM_CREATE (GLOBAL).
 * Enforces:
 * - Department exists and is ACTIVE
 * - Team name is unique per department
 */
const createTeam = async (data, adminUserId) => {
  const department = await prisma.department.findUnique({
    where: { id: data.departmentId },
  });
  if (!department) {
    throw new AppError("Department not found", 404);
  }
  if (department.status !== "ACTIVE") {
    throw new AppError("Cannot create team in an inactive department", 400);
  }

  // Pre-check name uniqueness in department
  const existingTeamInDept = await prisma.team.findFirst({
    where: {
      departmentId: data.departmentId,
      name: data.name,
    },
  });
  if (existingTeamInDept) {
    throw new AppError(
      "A team with this name already exists in this department",
      400,
    );
  }

  try {
    return await prisma.team.create({
      data: {
        name: data.name,
        description: data.description || null,
        teamAdminEmail: data.teamAdminEmail,
        departmentId: data.departmentId,
        status: data.status || "ACTIVE",
        createdById: adminUserId,
      },
      include: {
        department: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: { where: { removedAt: null } },
            tickets: true,
          },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        "A team with this name already exists in this department",
        400,
      );
    }
    throw error;
  }
};

/**
 * Lists teams based on caller's scope and filters.
 * - Admin (GLOBAL scope on TEAM_VIEW): sees all teams matching filters.
 * - User (TEAM scope on TEAM_VIEW): sees only teams they hold active membership in.
 */
const listTeams = async ({
  departmentId,
  includeInactive = false,
  user,
  isGlobalScope = true,
}) => {
  const where = {};

  if (!isGlobalScope && user?.id) {
    where.members = {
      some: {
        userId: user.id,
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

  return prisma.team.findMany({
    where,
    include: {
      department: {
        select: { id: true, name: true },
      },
      _count: {
        select: {
          members: { where: { removedAt: null } },
          tickets: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
};

/**
 * Retrieves a single team by ID.
 */
const getTeamById = async (id) => {
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      department: {
        select: { id: true, name: true },
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

  return team;
};

/**
 * Updates an existing team.
 * Catches DB trigger fn_prevent_team_department_change if departmentId change is attempted.
 */
const updateTeam = async (id, data) => {
  const existing = await prisma.team.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Team not found", 404);
  }

  const targetDeptId =
    data.departmentId !== undefined ? data.departmentId : existing.departmentId;

  if (data.name && (data.name !== existing.name || data.departmentId)) {
    const duplicate = await prisma.team.findFirst({
      where: {
        departmentId: targetDeptId,
        name: data.name,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new AppError(
        "A team with this name already exists in this department",
        400,
      );
    }
  }

  try {
    return await prisma.team.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        teamAdminEmail:
          data.teamAdminEmail !== undefined ? data.teamAdminEmail : undefined,
        departmentId:
          data.departmentId !== undefined ? data.departmentId : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
      include: {
        department: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: { where: { removedAt: null } },
            tickets: true,
          },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        "A team with this name already exists in this department",
        400,
      );
    }

    // Catch Postgres trigger fn_prevent_team_department_change
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
};

/**
 * Soft-retires a team (sets status = INACTIVE).
 */
const retireTeam = async (id) => {
  const existing = await prisma.team.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Team not found", 404);
  }

  return prisma.team.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

module.exports = {
  addTeamMember,
  removeTeamMember,
  getUserTeamMemberships,
  getTeamAssignees,
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  retireTeam,
};
