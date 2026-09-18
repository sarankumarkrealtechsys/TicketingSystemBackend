const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Adds a user to a team (or reactivates an inactive membership).
 * Records AuditLog (MEMBERSHIP_ADDED) inside the transaction.
 */
const addUserTeam = async ({ userId, teamId, adminUserId }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new AppError("Team not found", 404);
  }

  if (user.departmentId !== team.departmentId) {
    throw new AppError(
      "Cannot add user to team: user and team must belong to the same department",
      400,
    );
  }

  const existingMembership = await prisma.userTeam.findFirst({
    where: {
      userId,
      teamId,
    },
    orderBy: { id: "desc" },
  });

  if (existingMembership && existingMembership.removedAt === null) {
    throw new AppError("User is already an active member of this team", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let membership;
      if (existingMembership) {
        membership = await tx.userTeam.update({
          where: { id: existingMembership.id },
          data: {
            removedAt: null,
            joinedAt: new Date(),
            addedById: adminUserId,
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
      } else {
        membership = await tx.userTeam.create({
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
      }

      await tx.auditLog.create({
        data: {
          entityType: "UserTeam",
          entityId: membership.id,
          action: "MEMBERSHIP_ADDED",
          newValue: JSON.stringify({
            userId,
            teamId,
            reactivated: !!existingMembership,
          }),
          performedById: adminUserId,
        },
      });

      return membership;
    });
  } catch (error) {
    if (error.code === "P2002" || error.message?.includes("uq_user_team_active")) {
      throw new AppError("User is already an active member of this team", 400);
    }

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
 * Removes a user from a team (soft removal).
 * Records AuditLog (MEMBERSHIP_REMOVED) inside the transaction.
 */
const removeUserTeam = async ({ userId, teamId, adminUserId }) => {
  const activeMembership = await prisma.userTeam.findFirst({
    where: {
      userId,
      teamId,
      removedAt: null,
    },
  });

  if (!activeMembership) {
    throw new AppError("Active team membership not found for this user and team", 404);
  }

  return await prisma.$transaction(async (tx) => {
    const updatedMembership = await tx.userTeam.update({
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

    await tx.auditLog.create({
      data: {
        entityType: "UserTeam",
        entityId: activeMembership.id,
        action: "MEMBERSHIP_REMOVED",
        previousValue: JSON.stringify({ userId, teamId }),
        performedById: adminUserId,
      },
    });

    return updatedMembership;
  });
};

/**
 * Adds multiple users to a team in a single atomic transaction.
 * Reactivates existing inactive memberships or creates new ones.
 * Records AuditLogs for all added memberships.
 */
const bulkAddUserTeams = async ({ teamId, userIds, adminUserId }) => {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new AppError("Team not found", 404);
  }

  const uniqueUserIds = [...new Set(userIds)];

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, departmentId: true, status: true },
  });

  if (users.length !== uniqueUserIds.length) {
    const foundIds = new Set(users.map((u) => u.id));
    const missingIds = uniqueUserIds.filter((id) => !foundIds.has(id));
    throw new AppError(`User(s) not found: ${missingIds.join(", ")}`, 404);
  }

  const invalidDeptUsers = users.filter((u) => u.departmentId !== team.departmentId);
  if (invalidDeptUsers.length > 0) {
    const names = invalidDeptUsers.map((u) => u.name).join(", ");
    throw new AppError(
      `Cannot add user(s) to team: ${names} belong to a different department`,
      400,
    );
  }

  const existingMemberships = await prisma.userTeam.findMany({
    where: {
      teamId,
      userId: { in: uniqueUserIds },
    },
    orderBy: { id: "desc" },
  });

  const existingMap = new Map();
  for (const m of existingMemberships) {
    if (!existingMap.has(m.userId)) {
      existingMap.set(m.userId, m);
    }
  }

  return await prisma.$transaction(async (tx) => {
    const results = [];
    const now = new Date();

    for (const userId of uniqueUserIds) {
      const existing = existingMap.get(userId);

      if (existing && existing.removedAt === null) {
        continue;
      }

      let membership;
      if (existing) {
        membership = await tx.userTeam.update({
          where: { id: existing.id },
          data: {
            removedAt: null,
            joinedAt: now,
            addedById: adminUserId,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true, status: true },
            },
            user: {
              select: { id: true, name: true, username: true, departmentId: true },
            },
          },
        });
      } else {
        membership = await tx.userTeam.create({
          data: {
            userId,
            teamId,
            addedById: adminUserId,
            joinedAt: now,
            removedAt: null,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true, status: true },
            },
            user: {
              select: { id: true, name: true, username: true, departmentId: true },
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: "UserTeam",
          entityId: membership.id,
          action: "MEMBERSHIP_ADDED",
          newValue: JSON.stringify({
            userId,
            teamId,
            reactivated: !!existing,
          }),
          performedById: adminUserId,
        },
      });

      results.push(membership);
    }

    return {
      addedCount: results.length,
      memberships: results,
    };
  });
};

/**
 * Removes multiple users from a team in a single atomic transaction.
 * Records AuditLogs for all removed memberships.
 */
const bulkRemoveUserTeams = async ({ teamId, userIds, adminUserId }) => {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new AppError("Team not found", 404);
  }

  const uniqueUserIds = [...new Set(userIds)];

  const activeMemberships = await prisma.userTeam.findMany({
    where: {
      teamId,
      userId: { in: uniqueUserIds },
      removedAt: null,
    },
  });

  if (activeMemberships.length === 0) {
    return { removedCount: 0 };
  }

  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const membershipIds = activeMemberships.map((m) => m.id);

    await tx.userTeam.updateMany({
      where: { id: { in: membershipIds } },
      data: {
        removedAt: now,
        removedById: adminUserId,
      },
    });

    for (const membership of activeMemberships) {
      await tx.auditLog.create({
        data: {
          entityType: "UserTeam",
          entityId: membership.id,
          action: "MEMBERSHIP_REMOVED",
          previousValue: JSON.stringify({ userId: membership.userId, teamId }),
          performedById: adminUserId,
        },
      });
    }

    return { removedCount: activeMemberships.length };
  });
};

module.exports = {
  addUserTeam,
  removeUserTeam,
  bulkAddUserTeams,
  bulkRemoveUserTeams,
};
