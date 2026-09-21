const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Recursively force-closes all non-closed descendant sub-tickets of a parent ticket.
 * - Single recursive CTE query across all hierarchy levels (no N+1).
 * - Closes any descendant sub-ticket whose status behavior is NOT already 'CLOSED'.
 * - Resolves appropriate Closed status for each descendant's team (or falls back to default/global).
 * - Records TicketHistory with updatedById = user.id and cascade remarks.
 */
const cascadeCloseSubTickets = async (tx, parentTicket, defaultClosedStatusId, user) => {
  const descendants = await tx.$queryRaw`
    WITH RECURSIVE descendant_tree AS (
      SELECT t.id, t."ticketNumber", t."statusId", t."teamId", t."closedAt", s.behavior as "statusBehavior"
      FROM tickets t
      JOIN ticket_statuses s ON t."statusId" = s.id
      WHERE t."parentTicketId" = ${parentTicket.id}

      UNION ALL

      SELECT child.id, child."ticketNumber", child."statusId", child."teamId", child."closedAt", s.behavior as "statusBehavior"
      FROM tickets child
      JOIN ticket_statuses s ON child."statusId" = s.id
      JOIN descendant_tree parent ON child."parentTicketId" = parent.id
    )
    SELECT * FROM descendant_tree;
  `;

  const nonClosedDescendants = Array.isArray(descendants)
    ? descendants.filter((d) => d.statusBehavior !== "CLOSED")
    : [];

  if (nonClosedDescendants.length === 0) {
    return;
  }

  // Collect distinct teamIds from descendants to batch resolve team Closed statuses
  const teamIds = Array.from(
    new Set(nonClosedDescendants.map((d) => d.teamId).filter(Boolean))
  );

  const teamClosedStatuses = await tx.ticketStatus.findMany({
    where: {
      behavior: "CLOSED",
      status: "ACTIVE",
      teamId: { in: teamIds },
    },
    orderBy: { sortOrder: "asc" },
  });

  const teamStatusMap = new Map();
  for (const s of teamClosedStatuses) {
    if (!teamStatusMap.has(s.teamId)) {
      teamStatusMap.set(s.teamId, s.id);
    }
  }

  let fallbackClosedStatusId = defaultClosedStatusId;
  if (!fallbackClosedStatusId) {
    const globalClosed = await tx.ticketStatus.findFirst({
      where: { behavior: "CLOSED", status: "ACTIVE", teamId: null },
      orderBy: { sortOrder: "asc" },
    });
    if (globalClosed) {
      fallbackClosedStatusId = globalClosed.id;
    }
  }

  const cascadeNow = new Date();

  for (const sub of nonClosedDescendants) {
    const targetStatusId =
      (sub.teamId && teamStatusMap.get(sub.teamId)) || fallbackClosedStatusId;

    if (!targetStatusId) continue;

    const subUpdateData = { statusId: targetStatusId };
    if (!sub.closedAt) {
      subUpdateData.closedAt = cascadeNow;
    }

    await tx.ticket.update({
      where: { id: sub.id },
      data: subUpdateData,
    });

    await tx.ticketHistory.create({
      data: {
        ticketId: sub.id,
        action: "STATUS_CHANGED",
        previousStatusId: sub.statusId,
        newStatusId: targetStatusId,
        previousBehavior: sub.statusBehavior,
        newBehavior: "CLOSED",
        remarks: `Auto-closed via cascade from parent ticket #${parentTicket.ticketNumber}`,
        updatedById: user.id,
      },
    });
  }
};

/**
 * Changes ticket status (behavior-driven lifecycle).
 * - Gated by TICKET_CHANGE_STATUS (Admin GLOBAL, User ASSIGNED).
 * - Enforces status is active and scoped to ticket primary or collaborating teams.
 * - Set-once semantics for resolvedAt and closedAt milestone timestamps.
 * - If new status behavior is CLOSED, auto-cascades force-closure to all sub-tickets.
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
      // If closing parent ticket, auto-cascade close all descendant sub-tickets
      if (newStatus.behavior === "CLOSED") {
        await cascadeCloseSubTickets(tx, ticket, newStatus.id, user);
      }

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
      // 1. Recursive descendant collection in a single query (no N+1 loops) & auto-cascade
      await cascadeCloseSubTickets(tx, ticket, closedStatus.id, user);

      // 2. Update and close the parent ticket
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
