const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");
const inAppNotificationService = require("../notification/in-app-notification.service");
const notificationService = require("../notification/notification.service");

/**
 * Adds one or more assignees to an existing ticket.
 * - Supports single userId or multiple userIds.
 * - Enforces assignees are active and belong to the same department as the primary team.
 * - Enforces teamId context is primary team or an active collaborating team.
 * - Enforces partial unique constraint: cannot duplicate active assignment.
 * - Records ASSIGNEE_ADDED in TicketHistory for each assignee.
 */
const addTicketAssignee = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      status: { select: { behavior: true } },
      team: { select: { id: true, departmentId: true } },
      collaboratingTeams: {
        where: { removedAt: null },
        select: { teamId: true },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot add an assignee to a closed ticket", 400);
  }

  let targetTeamId = ticket.teamId;
  if (data.teamId) {
    const customTeamId = Number(data.teamId);
    const isPrimary = customTeamId === ticket.teamId;
    const isCollab = ticket.collaboratingTeams.some(
      (ct) => ct.teamId === customTeamId,
    );
    if (!isPrimary && !isCollab) {
      throw new AppError(
        "Assignee team is neither the primary team nor an active collaborating team on this ticket",
        400,
      );
    }
    targetTeamId = customTeamId;
  }

  // Normalize user IDs
  const rawIds = Array.isArray(data.userIds) && data.userIds.length > 0
    ? data.userIds
    : (data.userId !== undefined ? [data.userId] : []);
  const uniqueUserIds = Array.from(new Set(rawIds.map((id) => Number(id))));

  if (uniqueUserIds.length === 0) {
    throw new AppError("At least one assignee is required", 400);
  }

  const assigneeUsers = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, username: true, email: true, status: true, departmentId: true },
  });

  if (assigneeUsers.length !== uniqueUserIds.length) {
    throw new AppError("One or more assignee users were not found", 404);
  }

  for (const u of assigneeUsers) {
    if (u.status !== "ACTIVE") {
      throw new AppError(`Cannot assign inactive user "${u.name || u.username}"`, 400);
    }
    if (u.departmentId !== ticket.team.departmentId) {
      throw new AppError(
        `Cannot assign user "${u.name}" (id=${u.id}) — assignee must belong to the same department as the team`,
        400,
      );
    }
  }

  // Find currently active assignments on this ticket for these users
  const activeAssignments = await prisma.ticketAssignee.findMany({
    where: {
      ticketId: ticket.id,
      userId: { in: uniqueUserIds },
      removedAt: null,
    },
  });

  if (activeAssignments.length > 0) {
    if (uniqueUserIds.length === 1) {
      throw new AppError("User is already an active assignee on this ticket", 400);
    }
    const activeSet = new Set(activeAssignments.map((a) => a.userId));
    if (uniqueUserIds.every((id) => activeSet.has(id))) {
      throw new AppError("All selected users are already active assignees on this ticket", 400);
    }
  }

  const activeUserIdSet = new Set(activeAssignments.map((a) => a.userId));
  const toAssignUsers = assigneeUsers.filter((u) => !activeUserIdSet.has(u.id));

  // Find existing assignments to reactivate
  const existingAssignments = await prisma.ticketAssignee.findMany({
    where: {
      ticketId: ticket.id,
      userId: { in: toAssignUsers.map((u) => u.id) },
    },
    orderBy: { id: "desc" },
  });
  const existingByUserId = new Map();
  for (const ea of existingAssignments) {
    if (!existingByUserId.has(ea.userId)) {
      existingByUserId.set(ea.userId, ea);
    }
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const u of toAssignUsers) {
        let assigneeRecord;
        const existingAssignment = existingByUserId.get(u.id);
        if (existingAssignment) {
          assigneeRecord = await tx.ticketAssignee.update({
            where: { id: existingAssignment.id },
            data: {
              teamId: targetTeamId,
              removedAt: null,
              assignedAt: new Date(),
              assignedById: user.id,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                  departmentId: true,
                },
              },
            },
          });
        } else {
          assigneeRecord = await tx.ticketAssignee.create({
            data: {
              ticketId: ticket.id,
              userId: u.id,
              teamId: targetTeamId,
              assignedById: user.id,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                  departmentId: true,
                },
              },
            },
          });
        }

        await tx.ticketHistory.create({
          data: {
            ticketId: ticket.id,
            action: "ASSIGNEE_ADDED",
            newValue: JSON.stringify({
              userId: u.id,
              name: u.name || u.username || `User #${u.id}`,
              username: u.username || null,
              email: u.email || null,
              teamId: targetTeamId,
            }),
            updatedById: user.id,
          },
        });

        records.push(assigneeRecord);
      }
      return records;
    });

    // Notify for each added assignee
    for (const u of toAssignUsers) {
      inAppNotificationService.notifyInAppAssigneeAdded({
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        summary: ticket.summary,
        assigneeUserId: u.id,
        actor: user,
      });

      notificationService.notifyAssigneeAdded(
        ticket.id,
        u,
        user,
      );
    }

    return Array.isArray(data.userIds) ? results : (results[0] || null);
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Removes an assignee from a ticket (soft removal).
 * - Enforces that at least one assignee remains (cannot remove last assignee).
 * - Records ASSIGNEE_REMOVED in TicketHistory.
 */
const removeTicketAssignee = async (ticketId, targetUserId, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      status: { select: { behavior: true } },
      assignees: {
        where: { removedAt: null },
        include: {
          user: { select: { id: true, name: true, username: true, email: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot remove an assignee from a closed ticket", 400);
  }

  const assignee = ticket.assignees.find(
    (a) => a.userId === Number(targetUserId),
  );

  if (!assignee) {
    throw new AppError("User is not actively assigned to this ticket", 404);
  }

  if (ticket.assignees.length <= 1) {
    throw new AppError("Cannot remove the only assignee from a ticket", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.ticketAssignee.update({
        where: { id: assignee.id },
        data: {
          removedAt: new Date(),
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "ASSIGNEE_REMOVED",
          previousValue: JSON.stringify({
            userId: assignee.userId,
            name: assignee.user.name || assignee.user.username || `User #${assignee.userId}`,
            username: assignee.user.username || null,
            email: assignee.user.email || null,
            teamId: assignee.teamId,
          }),
          updatedById: user.id,
        },
      });

      return {
        message: "Assignee removed successfully",
        userId: assignee.userId,
        removedUser: {
          id: assignee.userId,
          name: assignee.user.name,
          email: assignee.user.email,
        },
      };
    });

    inAppNotificationService.notifyInAppAssigneeRemoved({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: ticket.summary,
      removedUserId: assignee.userId,
      actor: user,
    });

    notificationService.notifyAssigneeRemoved(
      ticket.id,
      {
        id: assignee.userId,
        name: assignee.user.name,
        email: assignee.user.email,
      },
      user,
    );

    return result;
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  addTicketAssignee,
  removeTicketAssignee,
};
