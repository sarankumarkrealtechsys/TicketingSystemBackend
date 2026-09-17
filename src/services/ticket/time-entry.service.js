const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Logs time against a ticket.
 * - Gated by TICKET_LOG_TIME.
 * - Standard User: OWN scope only (can only log time for themselves, must be currently active assignee).
 * - Admin: GLOBAL scope (logs their own time).
 * - No impersonation: userId is strictly user.id for all callers.
 * - Atomic transaction creates TimeEntry and TicketHistory(TIME_LOGGED).
 */
const logTime = async (ticketId, data, user, isGlobalScope = false) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    select: {
      id: true,
      ticketNumber: true,
      status: { select: { behavior: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  // Active assignee verification for standard users
  if (!isGlobalScope) {
    const activeAssignment = await prisma.ticketAssignee.findFirst({
      where: {
        ticketId: ticket.id,
        userId: user.id,
        removedAt: null,
      },
    });

    if (!activeAssignment) {
      throw new AppError(
        "Only currently active assignees can log time on this ticket",
        403,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const timeEntry = await tx.timeEntry.create({
        data: {
          ticketId: ticket.id,
          userId: user.id,
          workDate: new Date(data.workDate),
          startTime: data.startTime ? new Date(data.startTime) : null,
          endTime: data.endTime ? new Date(data.endTime) : null,
          minutesSpent: Number(data.minutesSpent),
          workType: data.workType,
          note: data.note || null,
          isBillable: data.billable === true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
            },
          },
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "TIME_LOGGED",
          newValue: JSON.stringify({
            timeEntryId: timeEntry.id,
            minutesSpent: timeEntry.minutesSpent,
            workType: timeEntry.workType,
            workDate: timeEntry.workDate,
            isBillable: timeEntry.isBillable,
            note: timeEntry.note,
          }),
          remarks: data.note || `${timeEntry.minutesSpent}m logged (${timeEntry.workType})`,
          updatedById: user.id,
        },
      });

      return timeEntry;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Computes database-level aggregation of logged time for a specific ticket.
 * - Standard User: restricted strictly to their own time data (where.userId = user.id).
 * - Admin GLOBAL: complete ticket summary across all assignees.
 */
const getTicketTimeSummary = async (ticketId, query = {}, user = null, isGlobalScope = false) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    select: { id: true, ticketNumber: true },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const where = {
    ticketId: ticket.id,
  };

  if (!isGlobalScope && user?.id) {
    where.userId = user.id;
  }

  if (query.workType) {
    where.workType = query.workType;
  }

  if (query.billable !== undefined) {
    where.isBillable = query.billable === "true" || query.billable === true;
  }

  if (query.startDate || query.endDate) {
    where.workDate = {};
    if (query.startDate) {
      where.workDate.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.workDate.lte = new Date(query.endDate);
    }
  }

  const [totalAgg, byAssignee, byWorkType, byBillable] = await Promise.all([
    prisma.timeEntry.aggregate({
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["workType"],
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["isBillable"],
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
  ]);

  // Hydrate user info for assignee breakdown
  const userIds = byAssignee.map((a) => a.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const assigneeBreakdown = byAssignee.map((a) => {
    const userInfo = userMap.get(a.userId) || { id: a.userId, name: "Unknown" };
    return {
      userId: a.userId,
      user: userInfo,
      minutesSpent: a._sum.minutesSpent || 0,
      entriesCount: a._count._all || 0,
    };
  });

  const workTypeBreakdown = byWorkType.map((w) => ({
    workType: w.workType,
    minutesSpent: w._sum.minutesSpent || 0,
    entriesCount: w._count._all || 0,
  }));

  const billableRecord = byBillable.find((b) => b.isBillable === true);
  const nonBillableRecord = byBillable.find((b) => b.isBillable === false);

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    totalMinutes: totalAgg._sum.minutesSpent || 0,
    totalEntries: totalAgg._count._all || 0,
    breakdown: {
      byAssignee: assigneeBreakdown,
      byWorkType: workTypeBreakdown,
      byBillable: {
        billableMinutes: billableRecord?._sum.minutesSpent || 0,
        billableEntries: billableRecord?._count._all || 0,
        nonBillableMinutes: nonBillableRecord?._sum.minutesSpent || 0,
        nonBillableEntries: nonBillableRecord?._count._all || 0,
      },
    },
  };
};

/**
 * Lists time entries for a ticket with filtering and pagination.
 * - Standard User: restricted strictly to their own time entries (where.userId = user.id).
 * - Admin GLOBAL: lists all time entries for the ticket.
 */
const listTicketTimeEntries = async (
  ticketId,
  query = {},
  user = null,
  isGlobalScope = false,
) => {
  const where = {
    ticketId: Number(ticketId),
  };

  if (!isGlobalScope && user?.id) {
    where.userId = user.id;
  }

  if (query.workType) {
    where.workType = query.workType;
  }

  if (query.billable !== undefined) {
    where.isBillable = query.billable === "true" || query.billable === true;
  }

  if (query.startDate || query.endDate) {
    where.workDate = {};
    if (query.startDate) {
      where.workDate.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.workDate.lte = new Date(query.endDate);
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(query.pageSize || query.limit) || 20),
  );
  const skip = (page - 1) * pageSize;

  const [total, entries] = await Promise.all([
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

/**
 * Computes database-level aggregation of logged time for a specific user.
 * Restricted to the user's own time.
 */
const getUserTimeSummary = async (userId, query = {}) => {
  const targetUserId = Number(userId);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, username: true, email: true },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const where = {
    userId: targetUserId,
  };

  if (query.workType) {
    where.workType = query.workType;
  }

  if (query.billable !== undefined) {
    where.isBillable = query.billable === "true" || query.billable === true;
  }

  if (query.startDate || query.endDate) {
    where.workDate = {};
    if (query.startDate) {
      where.workDate.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.workDate.lte = new Date(query.endDate);
    }
  }

  const [totalAgg, byWorkType, byBillable] = await Promise.all([
    prisma.timeEntry.aggregate({
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["workType"],
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["isBillable"],
      where,
      _sum: { minutesSpent: true },
      _count: { _all: true },
    }),
  ]);

  const workTypeBreakdown = byWorkType.map((w) => ({
    workType: w.workType,
    minutesSpent: w._sum.minutesSpent || 0,
    entriesCount: w._count._all || 0,
  }));

  const billableRecord = byBillable.find((b) => b.isBillable === true);
  const nonBillableRecord = byBillable.find((b) => b.isBillable === false);

  return {
    user,
    totalMinutes: totalAgg._sum.minutesSpent || 0,
    totalEntries: totalAgg._count._all || 0,
    breakdown: {
      byWorkType: workTypeBreakdown,
      byBillable: {
        billableMinutes: billableRecord?._sum.minutesSpent || 0,
        billableEntries: billableRecord?._count._all || 0,
        nonBillableMinutes: nonBillableRecord?._sum.minutesSpent || 0,
        nonBillableEntries: nonBillableRecord?._count._all || 0,
      },
    },
  };
};

module.exports = {
  logTime,
  getTicketTimeSummary,
  listTicketTimeEntries,
  getUserTimeSummary,
};
