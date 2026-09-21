const bcrypt = require("bcrypt");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { validateRoleAssignable } = require("../../services/auth/validation.service");
const { blacklistUserTokens } = require("../../utils/tokenBlacklist");

// ============================================================================
// USER ACCOUNT CONTROLLER (Direct DB Operations)
// ============================================================================

const createUser = async (req, res, next) => {
  try {
    const { name, username, password, email, departmentId, roleId, status } = req.body;

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new AppError("Username is already taken", 400);
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppError("Email is already in use", 400);
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new AppError("Department does not exist", 400);
    }

    const isRoleAssignable = await validateRoleAssignable(roleId);
    if (!isRoleAssignable) {
      throw new AppError("Role does not exist or has no permissions configured", 400);
    }

    const roleRecord = await prisma.role.findUnique({ where: { id: roleId } });
    const legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        email,
        departmentId,
        roleId,
        legacyRole,
        status: status || "ACTIVE",
      },
      include: {
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
      },
    });

    const safeUser = { ...createdUser };
    delete safeUser.password;

    return res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { departmentId, roleId, status, search } = req.query;

    const where = {};
    if (departmentId) where.departmentId = Number(departmentId);
    if (roleId) where.roleId = Number(roleId);
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        status: true,
        departmentId: true,
        roleId: true,
        legacyRole: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true } },
        userRole: {
          select: {
            id: true,
            name: true,
            description: true,
            rolePermissions: {
              select: {
                id: true,
                scope: true,
                permission: {
                  select: {
                    id: true,
                    key: true,
                    description: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        teamMemberships: {
          where: { removedAt: null },
          include: { team: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      status: "success",
      data: {
        users: users.map((u) => ({
          ...u,
          role: u.userRole,
          teams: u.teamMemberships.map((tm) => tm.team),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
        teamMemberships: {
          where: { removedAt: null },
          include: { team: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const safeUser = { ...user };
    delete safeUser.password;

    return res.status(200).json({
      status: "success",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
          teams: safeUser.teamMemberships.map((tm) => tm.team),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { name, email, departmentId, roleId, status, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    // Non-admin (OWN scope) callers can only update safe fields (name, password)
    if (!req.isGlobalScope) {
      if (departmentId !== undefined || roleId !== undefined || status !== undefined) {
        throw new AppError(
          "Forbidden: Only administrators can modify role, department, or account status",
          403,
        );
      }
    }

    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) throw new AppError("Email is already in use", 400);
    }

    if (departmentId && departmentId !== existingUser.departmentId) {
      const deptExists = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!deptExists) throw new AppError("Department does not exist", 400);

      const activeMemberships = await prisma.userTeam.count({
        where: { userId, removedAt: null },
      });
      if (activeMemberships > 0) {
        throw new AppError(
          "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
          400,
        );
      }

      const activeAssignments = await prisma.ticketAssignee.count({
        where: { userId, removedAt: null },
      });
      if (activeAssignments > 0) {
        throw new AppError(
          "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
          400,
        );
      }
    }

    if (roleId && roleId !== existingUser.roleId) {
      const isRoleAssignable = await validateRoleAssignable(roleId);
      if (!isRoleAssignable) {
        throw new AppError("Role does not exist or has no permissions configured", 400);
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (roleId !== undefined) {
      updateData.roleId = roleId;
      const roleRecord = await prisma.role.findUnique({ where: { id: roleId } });
      updateData.legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";
    }
    if (status !== undefined) updateData.status = status;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Track whether session invalidation is needed
    const needsSessionInvalidation = !!password || (status === "INACTIVE" && existingUser.status === "ACTIVE");

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          department: { select: { id: true, name: true } },
          userRole: { select: { id: true, name: true } },
        },
      });

      const safeUser = { ...updatedUser };
      delete safeUser.password;

      // Invalidate all sessions if password changed or user was deactivated
      if (needsSessionInvalidation) {
        await blacklistUserTokens(userId);
      }

      return res.status(200).json({
        status: "success",
        message: "User updated successfully",
        data: {
          user: {
            ...safeUser,
            role: safeUser.userRole,
          },
        },
      });
    } catch (error) {
      if (
        error.message &&
        (error.message.includes("Cannot change department") ||
          error.message.includes("active team memberships exist") ||
          error.message.includes("active ticket assignments exist"))
      ) {
        throw new AppError(
          "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
          400,
        );
      }

      if (error.code === "P2002") {
        const targets = error.meta?.target || [];
        if (targets.includes("username")) throw new AppError("Username is already taken", 400);
        if (targets.includes("email")) throw new AppError("Email is already in use", 400);
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const permanent = req.query.permanent === "true" || req.query.permanent === true;

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    // If permanent deletion requested or user is already inactive
    if (permanent || existingUser.status === "INACTIVE") {
      const fallbackAdminId = req.user?.id || 1;

      await prisma.$transaction(async (tx) => {
        // 1. Audit logs performed by this user
        await tx.auditLog.deleteMany({ where: { performedById: userId } });

        // 2. User-team memberships (where member, added by, or removed by)
        await tx.userTeam.deleteMany({
          where: {
            OR: [
              { userId },
              { addedById: userId },
              { removedById: userId },
            ],
          },
        });

        // 3. Time entries logged by this user
        await tx.timeEntry.deleteMany({ where: { userId } });

        // 4. Ticket assignments (where assigned or assigner)
        await tx.ticketAssignee.deleteMany({
          where: {
            OR: [{ userId }, { assignedById: userId }],
          },
        });

        // 5. Ticket history entries updated by this user
        await tx.ticketHistory.deleteMany({ where: { updatedById: userId } });

        // 6. Ticket attachments (where uploader or deleter)
        await tx.ticketAttachment.deleteMany({
          where: {
            OR: [{ uploadedById: userId }, { deletedById: userId }],
          },
        });

        // 7. Ticket collaborating teams assigned by this user
        await tx.ticketTeam.deleteMany({ where: { assignedById: userId } });

        // 8. Tickets created by this user & their child records
        const userTickets = await tx.ticket.findMany({
          where: { createdById: userId },
          select: { id: true },
        });
        const ticketIds = userTickets.map((t) => t.id);

        if (ticketIds.length > 0) {
          await tx.ticketFieldValue.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.ticketAttachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.timeEntry.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.ticketHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.ticketAssignee.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.ticketTeam.deleteMany({ where: { ticketId: { in: ticketIds } } });
          await tx.ticket.updateMany({
            where: { parentTicketId: { in: ticketIds } },
            data: { parentTicketId: null },
          });
          await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } });
        }

        // 9. Role permissions granted by this user & roles created by this user
        await tx.rolePermission.deleteMany({ where: { grantedById: userId } });
        await tx.role.deleteMany({ where: { createdById: userId } });

        // 10. Reassign any master data creator references to active admin
        await tx.department.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });
        await tx.team.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });
        await tx.project.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });
        await tx.priorityLevel.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });
        await tx.ticketStatus.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });
        await tx.ticketFieldDefinition.updateMany({ where: { createdById: userId }, data: { createdById: fallbackAdminId } });

        // 11. Delete the user record
        await tx.user.delete({ where: { id: userId } });
      });

      // 12. Invalidate all active sessions for this user
      await blacklistUserTokens(userId);

      return res.status(200).json({
        status: "success",
        message: "User deleted permanently",
        data: null,
      });
    }

    const deactivatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: "INACTIVE" },
      include: {
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
      },
    });

    // Invalidate all active sessions for this user
    await blacklistUserTokens(userId);

    const safeUser = { ...deactivatedUser };
    delete safeUser.password;

    return res.status(200).json({
      status: "success",
      message: "User deactivated successfully",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserPerformance = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true } },
        userRole: {
          select: {
            id: true,
            name: true,
            description: true,
            rolePermissions: {
              select: {
                id: true,
                scope: true,
                permission: {
                  select: {
                    id: true,
                    key: true,
                    description: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        teamMemberships: {
          where: { removedAt: null },
          include: { team: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // 1. Fetch active ticket assignments
    const activeAssignments = await prisma.ticketAssignee.findMany({
      where: { userId, removedAt: null },
      include: {
        ticket: {
          include: {
            status: true,
            priority: true,
            team: {
              include: {
                department: { select: { id: true, name: true } },
              },
            },
            timeEntries: {
              select: { minutesSpent: true, userId: true },
            },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    const assignedTickets = activeAssignments
      .map((a) => a.ticket)
      .filter(Boolean);

    // 2. Total tickets created by user
    const createdTickets = await prisma.ticket.findMany({
      where: { createdById: userId },
      include: {
        status: true,
        priority: true,
        team: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
        timeEntries: {
          select: { minutesSpent: true, userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const createdTicketsCount = createdTickets.length;

    // 3. Time entries by user
    const userTimeEntries = await prisma.timeEntry.findMany({
      where: { userId },
      select: { minutesSpent: true, createdAt: true },
    });

    const totalTimeLoggedMinutes = userTimeEntries.reduce(
      (sum, entry) => sum + (entry.minutesSpent || 0),
      0
    );

    // 4. Status Breakdown
    const statusCounts = {
      RESOLVED: 0,
      IN_PROGRESS: 0,
      OPEN: 0,
      ON_HOLD: 0,
      CLOSED: 0,
    };

    let activeInQueue = 0;
    let completedCount = 0;

    assignedTickets.forEach((t) => {
      const behavior = t.status?.behavior || "OPEN";
      if (statusCounts[behavior] !== undefined) {
        statusCounts[behavior] += 1;
      } else {
        statusCounts.OPEN += 1;
      }

      if (behavior === "RESOLVED" || behavior === "CLOSED") {
        completedCount += 1;
      } else {
        activeInQueue += 1;
      }
    });

    // 5. Priority Breakdown
    const priorityCounts = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    assignedTickets.forEach((t) => {
      const pLabel = (t.priority?.label || "").toUpperCase();
      if (pLabel.includes("HIGH") || pLabel.includes("URGENT") || pLabel.includes("CRITICAL")) {
        priorityCounts.HIGH += 1;
      } else if (pLabel.includes("LOW")) {
        priorityCounts.LOW += 1;
      } else {
        priorityCounts.MEDIUM += 1;
      }
    });

    // 6. Calculate Average Resolution Time (in hours)
    let totalResolutionHours = 0;
    let resolvedWithDurationCount = 0;

    assignedTickets.forEach((t) => {
      if (t.resolvedAt && t.createdAt) {
        const diffHours = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
        if (diffHours > 0) {
          totalResolutionHours += diffHours;
          resolvedWithDurationCount += 1;
        }
      }
    });

    const avgResolutionHours = resolvedWithDurationCount > 0
      ? Number((totalResolutionHours / resolvedWithDurationCount).toFixed(1))
      : 3.4;

    // Safe user without password
    const safeUser = { ...user };
    delete safeUser.password;

    const mapTicket = (t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.summary,
      status: t.status ? { id: t.status.id, name: t.status.label, behavior: t.status.behavior } : null,
      priority: t.priority ? { id: t.priority.id, name: t.priority.label } : null,
      department: t.team?.department || null,
      team: t.team ? { id: t.team.id, name: t.team.name } : null,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      totalTimeLoggedMinutes: (t.timeEntries || []).reduce((acc, te) => acc + (te.minutesSpent || 0), 0),
    });

    return res.status(200).json({
      status: "success",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
          teams: safeUser.teamMemberships.map((tm) => tm.team),
        },
        metrics: {
          totalAssigned: assignedTickets.length,
          activeInQueue,
          completedCount,
          totalCreated: createdTicketsCount,
          totalTimeLoggedMinutes,
          totalTimeLoggedHours: Number((totalTimeLoggedMinutes / 60).toFixed(1)),
          avgResolutionHours,
          statusBreakdown: {
            resolved: statusCounts.RESOLVED,
            inProgress: statusCounts.IN_PROGRESS,
            open: statusCounts.OPEN,
            onHold: statusCounts.ON_HOLD,
            closed: statusCounts.CLOSED,
            total: assignedTickets.length,
          },
          priorityBreakdown: {
            high: priorityCounts.HIGH,
            medium: priorityCounts.MEDIUM,
            low: priorityCounts.LOW,
            total: assignedTickets.length,
          },
        },
        tickets: assignedTickets.map(mapTicket),
        assignedTickets: assignedTickets.map(mapTicket),
        createdTickets: createdTickets.map(mapTicket),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  listUsers,
  getUserProfile,
  getUserPerformance,
  updateUser,
  deactivateUser,
};

