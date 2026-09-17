const { prisma } = require("../../lib/prisma");

/**
 * Lists system audit logs with filters and pagination.
 * Exposes master-data changes, team membership changes, and denied access attempts.
 */
const listAuditLogs = async ({ query = {} }) => {
  const where = {};

  if (query.action) {
    where.action = query.action;
  }

  if (query.entityType) {
    where.entityType = query.entityType;
  }

  if (query.entityId) {
    where.entityId = Number(query.entityId);
  }

  if (query.performedById) {
    where.performedById = Number(query.performedById);
  }

  if (query.startDate || query.endDate) {
    where.performedAt = {};
    if (query.startDate) {
      where.performedAt.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.performedAt.lte = new Date(query.endDate);
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(query.pageSize || query.limit) || 20),
  );
  const skip = (page - 1) * pageSize;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { performedAt: "desc" },
      include: {
        performedBy: {
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
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

module.exports = {
  listAuditLogs,
};
