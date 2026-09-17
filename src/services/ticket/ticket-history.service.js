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

  const [total, history] = await Promise.all([
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
