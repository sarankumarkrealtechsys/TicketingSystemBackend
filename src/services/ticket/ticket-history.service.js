const { prisma } = require("../../lib/prisma");

/**
 * Retrieves chronological audit history for a specific ticket.
 * Supports filtering by action, updatedById, and date range.
 */
const getTicketHistory = async ({ ticketId, query = {} }) => {
  const where = {
    ticketId: Number(ticketId),
  };

  if (query.action) {
    where.action = query.action;
  }

  if (query.updatedById) {
    where.updatedById = Number(query.updatedById);
  }

  if (query.startDate || query.endDate) {
    where.updatedAt = {};
    if (query.startDate) {
      where.updatedAt.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.updatedAt.lte = new Date(query.endDate);
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(query.pageSize || query.limit) || 20),
  );
  const skip = (page - 1) * pageSize;

  const [total, rawHistory] = await Promise.all([
    prisma.ticketHistory.count({ where }),
    prisma.ticketHistory.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { updatedAt: "asc" },
      include: {
        updatedBy: {
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

  // Collect referenced entity IDs for batch lookup
  const statusIds = new Set();
  const priorityIds = new Set();
  const teamIds = new Set();

  for (const h of rawHistory) {
    if (h.previousStatusId) statusIds.add(h.previousStatusId);
    if (h.newStatusId) statusIds.add(h.newStatusId);
    if (h.previousPriorityId) priorityIds.add(h.previousPriorityId);
    if (h.newPriorityId) priorityIds.add(h.newPriorityId);
    if (h.previousTeamId) teamIds.add(h.previousTeamId);
    if (h.newTeamId) teamIds.add(h.newTeamId);
  }

  const [statuses, priorities, teams] = await Promise.all([
    statusIds.size > 0
      ? prisma.ticketStatus.findMany({
          where: { id: { in: Array.from(statusIds) } },
          select: { id: true, label: true, behavior: true },
        })
      : [],
    priorityIds.size > 0
      ? prisma.priorityLevel.findMany({
          where: { id: { in: Array.from(priorityIds) } },
          select: { id: true, label: true },
        })
      : [],
    teamIds.size > 0
      ? prisma.team.findMany({
          where: { id: { in: Array.from(teamIds) } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const statusMap = new Map(statuses.map((s) => [s.id, s]));
  const priorityMap = new Map(priorities.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const history = rawHistory.map((h) => ({
    ...h,
    previousStatus: h.previousStatusId ? statusMap.get(h.previousStatusId) || null : null,
    newStatus: h.newStatusId ? statusMap.get(h.newStatusId) || null : null,
    previousPriority: h.previousPriorityId ? priorityMap.get(h.previousPriorityId) || null : null,
    newPriority: h.newPriorityId ? priorityMap.get(h.newPriorityId) || null : null,
    previousTeam: h.previousTeamId ? teamMap.get(h.previousTeamId) || null : null,
    newTeam: h.newTeamId ? teamMap.get(h.newTeamId) || null : null,
  }));

  return {
    history,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

module.exports = {
  getTicketHistory,
};
