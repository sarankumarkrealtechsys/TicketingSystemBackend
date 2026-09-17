const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Changes ticket status (behavior-driven lifecycle).
 * - Gated by TICKET_CHANGE_STATUS (Admin GLOBAL, User ASSIGNED).
 * - Enforces status is active and scoped to ticket primary or collaborating teams.
 * - Set-once semantics for resolvedAt and closedAt milestone timestamps.
 * - Records STATUS_CHANGED in TicketHistory with previous/new status and behavior.
 */
const changeTicketStatus = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      status: { select: { id: true, label: true, behavior: true } },
      collaboratingTeams: {
        where: { removedAt: null },
        select: { teamId: true },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const newStatusId = Number(data.statusId);
  const newStatus = await prisma.ticketStatus.findUnique({
    where: { id: newStatusId },
  });

  if (!newStatus) {
    throw new AppError("Ticket status not found", 404);
  }

  if (newStatus.status !== "ACTIVE") {
    throw new AppError("Cannot change ticket status to an inactive status", 400);
  }

  if (newStatus.id === ticket.statusId) {
    throw new AppError("Ticket is already in this status", 400);
  }

  // Enforce status team-scoping: must be global or match ticket primary team or active collaborating teams
  const activeCollabTeamIds = ticket.collaboratingTeams.map((ct) => ct.teamId);
  const isStatusInScope =
    newStatus.teamId === null ||
    newStatus.teamId === ticket.teamId ||
    activeCollabTeamIds.includes(newStatus.teamId);

  if (!isStatusInScope) {
    throw new AppError(
      "The selected ticket status does not belong to this team or global statuses",
      400,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updateData = {
        statusId: newStatus.id,
      };

      // Set-once semantics for resolvedAt
      if (!ticket.resolvedAt && newStatus.behavior === "RESOLVED") {
        updateData.resolvedAt = new Date();
      }

      // Set-once semantics for closedAt
      if (!ticket.closedAt && newStatus.behavior === "CLOSED") {
        updateData.closedAt = new Date();
      }

      const updatedTicket = await tx.ticket.update({
        where: { id: ticket.id },
        data: updateData,
        include: {
          project: { select: { id: true, name: true } },
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
          priority: { select: { id: true, label: true, sortOrder: true } },
          status: { select: { id: true, label: true, behavior: true } },
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "STATUS_CHANGED",
          previousStatusId: ticket.statusId,
          newStatusId: newStatus.id,
          previousBehavior: ticket.status.behavior,
          newBehavior: newStatus.behavior,
          remarks: data.remarks || null,
          updatedById: user.id,
        },
      });

      Object.defineProperty(updatedTicket, "_previousStatus", {
        value: ticket.status,
        enumerable: false,
      });

      return updatedTicket;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Closes a ticket.
 * - Gated by TICKET_CLOSE (Admin GLOBAL, User ASSIGNED).
 * - Standard User can ONLY close if ticket's current status behavior is RESOLVED.
 * - Admin can close from any behavior at any time.
 * - Resolves team-specific Closed status first, falling back to global Closed status.
 * - Set-once semantics for closedAt.
 * - Records STATUS_CHANGED in TicketHistory.
 */
const closeTicket = async (ticketId, data, user, isGlobalScope = false) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      status: { select: { id: true, label: true, behavior: true } },
      collaboratingTeams: {
        where: { removedAt: null },
        select: { teamId: true },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status.behavior === "CLOSED") {
    throw new AppError("Ticket is already closed", 400);
  }

  // Business rule: User with ASSIGNED scope can only close if ticket behavior is RESOLVED.
  // Admin with GLOBAL scope can close from any behavior.
  if (!isGlobalScope && ticket.status.behavior !== "RESOLVED") {
    throw new AppError(
      "Only tickets in Resolved status can be closed by an assignee",
      400,
    );
  }

  // Resolve team-specific Closed status first, fallback to global Closed status
  let closedStatus = await prisma.ticketStatus.findFirst({
    where: {
      behavior: "CLOSED",
      status: "ACTIVE",
      teamId: ticket.teamId,
    },
    orderBy: { sortOrder: "asc" },
  });

  if (!closedStatus) {
    closedStatus = await prisma.ticketStatus.findFirst({
      where: {
        behavior: "CLOSED",
        status: "ACTIVE",
        teamId: null,
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  if (!closedStatus) {
    throw new AppError("No active Closed status found for this team", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updateData = {
        statusId: closedStatus.id,
      };

      // Set-once semantics for closedAt
      if (!ticket.closedAt) {
        updateData.closedAt = new Date();
      }

      const updatedTicket = await tx.ticket.update({
        where: { id: ticket.id },
        data: updateData,
        include: {
          project: { select: { id: true, name: true } },
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
          priority: { select: { id: true, label: true, sortOrder: true } },
          status: { select: { id: true, label: true, behavior: true } },
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "STATUS_CHANGED",
          previousStatusId: ticket.statusId,
          newStatusId: closedStatus.id,
          previousBehavior: ticket.status.behavior,
          newBehavior: "CLOSED",
          remarks: data?.remarks || "Ticket closed",
          updatedById: user.id,
        },
      });

      Object.defineProperty(updatedTicket, "_previousStatus", {
        value: ticket.status,
        enumerable: false,
      });

      return updatedTicket;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Changes ticket priority.
 * - Gated by TICKET_CHANGE_PRIORITY (Admin GLOBAL, User ASSIGNED).
 * - Enforces target priority is active.
 * - Records PRIORITY_CHANGED in TicketHistory.
 */
const changeTicketPriority = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      status: { select: { behavior: true } },
      priority: { select: { id: true, label: true, sortOrder: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot change priority on a closed ticket", 400);
  }

  const newPriorityId = Number(data.priorityId);
  if (newPriorityId === ticket.priorityId) {
    throw new AppError("Ticket already has this priority level", 400);
  }

  const newPriority = await prisma.priorityLevel.findUnique({
    where: { id: newPriorityId },
  });

  if (!newPriority) {
    throw new AppError("Priority level not found", 404);
  }

  if (newPriority.status !== "ACTIVE") {
    throw new AppError("Cannot select an inactive priority level", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          priorityId: newPriority.id,
        },
        include: {
          project: { select: { id: true, name: true } },
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
          priority: { select: { id: true, label: true, sortOrder: true } },
          status: { select: { id: true, label: true, behavior: true } },
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "PRIORITY_CHANGED",
          previousPriorityId: ticket.priorityId,
          newPriorityId: newPriority.id,
          remarks: data.remarks || null,
          updatedById: user.id,
        },
      });

      Object.defineProperty(updatedTicket, "_previousPriority", {
        value: ticket.priority,
        enumerable: false,
      });

      return updatedTicket;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  changeTicketStatus,
  closeTicket,
  changeTicketPriority,
};
