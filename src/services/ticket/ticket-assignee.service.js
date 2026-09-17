const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Adds an assignee to an existing ticket.
 * - Enforces assignee is active and belongs to the same department as the primary team.
 * - Enforces teamId context is primary team or an active collaborating team.
 * - Enforces partial unique constraint: cannot duplicate active assignment.
 * - Records ASSIGNEE_ADDED in TicketHistory.
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

  const assigneeUser = await prisma.user.findUnique({
    where: { id: Number(data.userId) },
    select: { id: true, name: true, status: true, departmentId: true },
  });

  if (!assigneeUser) {
    throw new AppError("Assignee user not found", 404);
  }
  if (assigneeUser.status !== "ACTIVE") {
    throw new AppError("Cannot assign an inactive user", 400);
  }

  if (assigneeUser.departmentId !== ticket.team.departmentId) {
    throw new AppError(
      `Cannot assign user "${assigneeUser.name}" (id=${assigneeUser.id}) — assignee must belong to the same department as the team`,
      400,
    );
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

  const activeAssignment = await prisma.ticketAssignee.findFirst({
    where: {
      ticketId: ticket.id,
      userId: assigneeUser.id,
      removedAt: null,
    },
  });

  if (activeAssignment) {
    throw new AppError("User is already an active assignee on this ticket", 400);
  }

  const existingAssignment = await prisma.ticketAssignee.findFirst({
    where: {
      ticketId: ticket.id,
      userId: assigneeUser.id,
    },
    orderBy: { id: "desc" },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      let assigneeRecord;
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
            userId: assigneeUser.id,
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
            userId: assigneeUser.id,
            name: assigneeUser.name,
            teamId: targetTeamId,
          }),
          updatedById: user.id,
        },
      });

      return assigneeRecord;
    });
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
          user: { select: { id: true, name: true, email: true } },
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
    return await prisma.$transaction(async (tx) => {
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
            name: assignee.user.name,
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
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  addTicketAssignee,
  removeTicketAssignee,
};
