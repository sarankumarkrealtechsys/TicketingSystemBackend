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

module.exports = {
  addUserTeam,
  removeUserTeam,
};
