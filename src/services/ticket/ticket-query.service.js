const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { computeTicketActions } = require("./ticket-permission.helper");
const { calculateTicketAge, getAgingBucket } = require("./ticket-age.helper");
const timeEntryService = require("./time-entry.service");

/**
 * Lists tickets with basic filters and pagination.
 * - Admin (GLOBAL): sees all tickets.
 * - User (TEAM): sees tickets belonging to teams they are active members in.
 */
const listTickets = async ({ query, user, isGlobalScope = false }) => {
  const where = {};

  if (query.scope === "created") {
    where.createdById = user.id;
  } else if (query.scope === "assigned") {
    where.assignees = {
      some: {
        userId: user.id,
        removedAt: null,
      },
    };
  } else if (query.scope === "personal") {
    where.OR = [
      { createdById: user.id },
      {
        assignees: {
          some: {
            userId: user.id,
            removedAt: null,
          },
        },
      },
    ];
  } else if (!isGlobalScope) {
    where.OR = [
      { createdById: user.id },
      {
        assignees: {
          some: {
            userId: user.id,
            removedAt: null,
          },
        },
      },
      {
        team: {
          members: {
            some: {
              userId: user.id,
              removedAt: null,
            },
          },
        },
      },
      {
        collaboratingTeams: {
          some: {
            team: {
              members: {
                some: {
                  userId: user.id,
                  removedAt: null,
                },
              },
            },
            removedAt: null,
          },
        },
      },
    ];
  }

  if (query.createdById) where.createdById = Number(query.createdById);
  if (query.teamId) where.teamId = Number(query.teamId);
  if (query.statusId) where.statusId = Number(query.statusId);
  if (query.priorityId) where.priorityId = Number(query.priorityId);
  if (query.projectId) where.projectId = Number(query.projectId);

  if (query.assigneeId) {
    where.assignees = {
      some: {
        userId: Number(query.assigneeId),
        removedAt: null,
      },
    };
  }

  if (query.parentTicketId) {
    where.parentTicketId = Number(query.parentTicketId);
  } else if (query.ticketType === "main" || query.isSubTicket === false || query.isSubTicket === "false") {
    where.parentTicketId = null;
  } else if (query.ticketType === "sub" || query.isSubTicket === true || query.isSubTicket === "true") {
    where.parentTicketId = { not: null };
  }

  const startDate = query.startDate || query.createdAfter;
  const endDate = query.endDate || query.createdBefore;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  if (query.search) {
    const s = query.search.trim();
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { ticketNumber: { contains: s, mode: "insensitive" } },
        { summary: { contains: s, mode: "insensitive" } },
        {
          assignees: {
            some: {
              removedAt: null,
              user: { name: { contains: s, mode: "insensitive" } },
            },
          },
        },
      ],
    });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(query.pageSize || query.limit) || 20),
  );
  const skip = (page - 1) * pageSize;

  const [total, rawTickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, departmentId: true } },
        priority: { select: { id: true, label: true, sortOrder: true } },
        status: { select: { id: true, label: true, behavior: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        parentTicket: { select: { id: true, ticketNumber: true, summary: true } },
        assignees: {
          where: { removedAt: null },
          select: {
            teamId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: { subTickets: true },
        },
      },
    }),
  ]);

  const now = Date.now();
  const tickets = rawTickets.map((t) => {
    const age = calculateTicketAge(t.createdAt, t.closedAt, now);

    return {
      ...t,
      subTicketsCount: t._count?.subTickets || 0,
      age: {
        hours: age.hours,
        days: age.days,
        formatted: age.formatted,
      },
    };
  });

  return {
    tickets,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

/**
 * Fetches single ticket detail with full relations.
 * Verifies team or collaborating team membership if caller is non-admin.
 */
const getTicketById = async (id, user, isGlobalScope = false, userPermissions = {}) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(id) },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
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
      parentTicket: { select: { id: true, ticketNumber: true, summary: true } },
      subTickets: {
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          description: true,
          projectId: true,
          teamId: true,
          priorityId: true,
          statusId: true,
          createdById: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          closedAt: true,
          priority: { select: { id: true, label: true, sortOrder: true } },
          status: { select: { id: true, label: true, behavior: true } },
          team: { select: { id: true, name: true } },
          assignees: {
            where: { removedAt: null },
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
      assignees: {
        where: { removedAt: null },
        select: {
          id: true,
          userId: true,
          teamId: true,
          assignedAt: true,
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
      },
      collaboratingTeams: {
        where: { removedAt: null },
        select: {
          id: true,
          teamId: true,
          assignedAt: true,
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
            },
          },
        },
      },
      customFieldValues: {
        include: {
          fieldDefinition: {
            select: {
              id: true,
              name: true,
              fieldType: true,
              isRequired: true,
              options: true,
            },
          },
        },
      },
      attachments: {
        where: { deletedAt: null },
        select: {
          id: true,
          originalFileName: true,
          storageKey: true,
          mimeType: true,
          fileExtension: true,
          fileSizeBytes: true,
          checksum: true,
          createdAt: true,
          uploadedById: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  // Non-admin scope check (creator, active assignee, member of primary or collaborating team)
  if (!isGlobalScope) {
    const isCreator = ticket.createdById === user.id;
    const isAssignee = ticket.assignees.some((a) => a.userId === user.id);

    if (!isCreator && !isAssignee) {
      const allowedTeamIds = [
        ticket.teamId,
        ...ticket.collaboratingTeams.map((ct) => ct.teamId),
      ];
      const isMember = await prisma.userTeam.findFirst({
        where: {
          userId: user.id,
          teamId: { in: allowedTeamIds },
          removedAt: null,
        },
      });
      if (!isMember) {
        throw new AppError(
          "Forbidden: You do not have access to view tickets for this team",
          403,
        );
      }
    }
  }

  const subTickets = ticket.subTickets || [];
  const byBehavior = {
    OPEN: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };
  for (const st of subTickets) {
    if (st.status?.behavior && byBehavior[st.status.behavior] !== undefined) {
      byBehavior[st.status.behavior]++;
    }
  }
  const resolvedCount = byBehavior.RESOLVED;
  const rollup = {
    total: subTickets.length,
    byBehavior,
    summary: `${resolvedCount} of ${subTickets.length} Resolved`,
  };

  // Re-use time-entry service aggregation for total logged time
  const timeSummary = await timeEntryService.getTicketTimeSummary(
    ticket.id,
    {},
    null,
    true,
  );
  const totalMinutes = timeSummary.totalMinutes || 0;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const actions = computeTicketActions(ticket, user, userPermissions);

  const subTicketsWithActions = (ticket.subTickets || []).map((st) => ({
    ...st,
    actions: computeTicketActions(
      {
        ...st,
        parentTicket: ticket,
      },
      user,
      userPermissions
    ),
  }));

  return {
    ...ticket,
    subTickets: subTicketsWithActions,
    subTicketsRollup: rollup,
    timeLogged: {
      totalMinutes,
      formatted: formattedTime,
    },
    actions,
  };
};

/**
 * Returns aggregated statistics for KPI dashboard cards and charts.
 * Scoped by caller's permissions (Admin sees all, User sees active personal/team tickets).
 */
const getTicketStats = async (user, isGlobalScope = false, scope = null) => {
  const where = {};

  if (scope === "personal" || !isGlobalScope) {
    where.OR = [
      { createdById: user.id },
      {
        assignees: {
          some: {
            userId: user.id,
            removedAt: null,
          },
        },
      },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      status: { select: { behavior: true } },
      priorityId: true,
      priority: { select: { id: true, label: true } },
    },
  });

  const byStatusBehavior = {
    OPEN: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };

  const priorityMap = {};

  for (const t of tickets) {
    const beh = t.status?.behavior;
    if (beh && byStatusBehavior[beh] !== undefined) {
      byStatusBehavior[beh]++;
    }

    if (t.priorityId) {
      if (!priorityMap[t.priorityId]) {
        priorityMap[t.priorityId] = {
          priorityId: t.priorityId,
          label: t.priority?.label || "",
          count: 0,
        };
      }
      priorityMap[t.priorityId].count++;
    }
  }

  return {
    total: tickets.length,
    byStatusBehavior,
    byPriority: Object.values(priorityMap),
  };
};

/**
 * Generates Ticket Aging Report for all open/unresolved tickets (behavior in OPEN, IN_PROGRESS, ON_HOLD).
 * - Admin (GLOBAL): sees all tickets across all teams.
 * - User (TEAM): sees tickets for caller's assigned and collaborating teams.
 * - Supports filtering by teamId, projectId, priorityId (combined with AND).
 * - Buckets into: 0-24h, 1-3 days, 3-7 days, 7+ days.
 */
const getAgingReport = async ({ query = {}, user, isGlobalScope = false }) => {
  const baseFilter = {};

  if (!isGlobalScope) {
    baseFilter.OR = [
      { createdById: user.id },
      {
        assignees: {
          some: {
            userId: user.id,
            removedAt: null,
          },
        },
      },
      {
        team: {
          members: {
            some: {
              userId: user.id,
              removedAt: null,
            },
          },
        },
      },
      {
        collaboratingTeams: {
          some: {
            team: {
              members: {
                some: {
                  userId: user.id,
                  removedAt: null,
                },
              },
            },
            removedAt: null,
          },
        },
      },
    ];
  }

  if (query.teamId) baseFilter.teamId = Number(query.teamId);
  if (query.projectId) baseFilter.projectId = Number(query.projectId);
  if (query.priorityId) baseFilter.priorityId = Number(query.priorityId);

  const openWhere = {
    ...baseFilter,
    status: {
      behavior: {
        notIn: ["RESOLVED", "CLOSED"],
      },
    },
  };

  const resolvedWhere = {
    ...baseFilter,
    status: {
      behavior: "RESOLVED",
    },
  };

  const [rawTickets, pendingClosureCount] = await Promise.all([
    prisma.ticket.findMany({
      where: openWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        createdAt: true,
        closedAt: true,
        team: { select: { id: true, name: true, departmentId: true } },
        project: { select: { id: true, name: true } },
        priority: { select: { id: true, label: true, sortOrder: true } },
        status: { select: { id: true, label: true, behavior: true } },
        assignees: {
          where: { removedAt: null },
          select: {
            teamId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.ticket.count({
      where: resolvedWhere,
    }),
  ]);

  const now = Date.now();
  const buckets = {
    "0-24h": 0,
    "1-3 days": 0,
    "3-7 days": 0,
    "7+ days": 0,
  };

  const tickets = rawTickets.map((t) => {
    const age = calculateTicketAge(t.createdAt, t.closedAt, now);
    const bucket = getAgingBucket(age.hours);
    buckets[bucket]++;

    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      createdAt: t.createdAt,
      age: {
        hours: age.hours,
        days: age.days,
        formatted: age.formatted,
      },
      bucket,
      team: t.team,
      project: t.project,
      priority: t.priority,
      status: t.status,
      assignees: t.assignees,
    };
  });

  let oldestBucket = null;
  if (buckets["7+ days"] > 0) {
    oldestBucket = "7+ days";
  } else if (buckets["3-7 days"] > 0) {
    oldestBucket = "3-7 days";
  } else if (buckets["1-3 days"] > 0) {
    oldestBucket = "1-3 days";
  } else if (buckets["0-24h"] > 0) {
    oldestBucket = "0-24h";
  }

  return {
    totalOpenTickets: tickets.length,
    pendingClosureCount,
    buckets,
    oldestBucket,
    tickets,
  };
};

module.exports = {
  listTickets,
  getTicketById,
  getTicketStats,
  getAgingReport,
};

