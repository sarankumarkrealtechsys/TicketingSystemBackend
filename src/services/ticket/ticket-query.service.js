const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { computeTicketActions } = require("./ticket-permission.helper");
const { calculateTicketAge, getAgingBucket } = require("./ticket-age.helper");
const timeEntryService = require("./time-entry.service");

/**
 * Lists tickets with basic filters and pagination.
 * - Admin (GLOBAL): sees all tickets.
/**
 * Builds Prisma where filter object based on query params and user RBAC scope.
 */
const buildTicketWhereQuery = ({ query, user, isGlobalScope = false }) => {
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

  return where;
};

/**
 * Lists tickets with basic filters and pagination.
 * - Admin (GLOBAL): sees all tickets.
 * - User (TEAM): sees tickets belonging to teams they are active members in.
 */
const listTickets = async ({ query, user, isGlobalScope = false }) => {
  const where = buildTicketWhereQuery({ query, user, isGlobalScope });

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
 * Exports all matching tickets for reports (bypasses 100-item page limit, up to 5000 records).
 * Supports format=csv (streams RFC 4180 with BOM) and format=json.
 */
const exportTickets = async ({ query, user, isGlobalScope = false }) => {
  const where = buildTicketWhereQuery({ query, user, isGlobalScope });
  const maxLimit = Math.min(5000, Math.max(1, Number(query.limit) || 5000));

  const rawTickets = await prisma.ticket.findMany({
    where,
    take: maxLimit,
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
    },
  });

  const tickets = rawTickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    summary: t.summary,
    description: t.description || "",
    project: t.project?.name || "—",
    team: t.team?.name || "—",
    priority: t.priority?.label || "Normal",
    status: t.status?.label || t.status?.behavior || "Open",
    statusBehavior: t.status?.behavior || "OPEN",
    createdBy: t.createdBy?.name || t.createdBy?.email || "—",
    assignees:
      (t.assignees || [])
        .map((a) => a.user?.name || a.user?.email)
        .filter(Boolean)
        .join(", ") || "Unassigned",
    isSubTicket: Boolean(t.parentTicketId),
    parentTicketNumber: t.parentTicket?.ticketNumber || "",
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : "",
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : "",
    closedAt: t.closedAt ? new Date(t.closedAt).toISOString() : "",
  }));

  if (query.format === "csv") {
    const headers = [
      "Ticket Number",
      "Summary",
      "Project",
      "Team",
      "Priority",
      "Status",
      "Assignees",
      "Created By",
      "Created At",
      "Last Updated",
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = tickets.map((t) => [
      escapeCsv(t.ticketNumber),
      escapeCsv(t.summary),
      escapeCsv(t.project),
      escapeCsv(t.team),
      escapeCsv(t.priority),
      escapeCsv(t.status),
      escapeCsv(t.assignees),
      escapeCsv(t.createdBy),
      escapeCsv(t.createdAt ? new Date(t.createdAt).toLocaleString() : ""),
      escapeCsv(t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""),
    ]);

    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    return { format: "csv", csvContent, total: tickets.length };
  }

  return { format: "json", tickets, total: tickets.length };
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
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
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

  const isPersonalOrScoped = scope === "personal" || !isGlobalScope;

  if (isPersonalOrScoped) {
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

  // Determine allowed status scope:
  // - Global scope (Admin Dashboard): only pre-seed Global statuses (teamId: null).
  // - Personal scope (User Dashboard / My Tickets): Global statuses + user's active team statuses.
  let statusWhere = { status: "ACTIVE" };
  if (isPersonalOrScoped) {
    const userTeams = await prisma.userTeam.findMany({
      where: { userId: user.id, removedAt: null },
      select: { teamId: true },
    });
    const userTeamIds = userTeams.map((ut) => ut.teamId);
    statusWhere = {
      status: "ACTIVE",
      OR: [{ teamId: null }, { teamId: { in: userTeamIds } }],
    };
  } else {
    statusWhere = {
      status: "ACTIVE",
      teamId: null,
    };
  }

  // Fetch active master data and tickets in parallel
  // Global statuses are pre-seeded for byStatus, while byStatusBehavior aggregates all tickets
  const [allPriorities, allStatuses, tickets] = await Promise.all([
    prisma.priorityLevel.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, sortOrder: true },
    }),
    prisma.ticketStatus.findMany({
      where: { status: "ACTIVE", teamId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, behavior: true, sortOrder: true, teamId: true },
    }),
    prisma.ticket.findMany({
      where,
      select: {
        id: true,
        statusId: true,
        status: { select: { id: true, label: true, behavior: true, sortOrder: true, teamId: true } },
        priorityId: true,
        priority: { select: { id: true, label: true, sortOrder: true } },
      },
    }),
  ]);

  const byStatusBehavior = {
    OPEN: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };

  // Pre-seed priorityMap with all active priorities
  const priorityMap = new Map();
  for (const p of allPriorities) {
    priorityMap.set(p.id, {
      priorityId: p.id,
      label: p.label,
      sortOrder: p.sortOrder ?? 0,
      count: 0,
    });
  }

  // Pre-seed statusMap with global default statuses
  const statusMap = new Map();
  for (const s of allStatuses) {
    statusMap.set(s.id, {
      statusId: s.id,
      label: s.label,
      behavior: s.behavior,
      sortOrder: s.sortOrder ?? 0,
      count: 0,
    });
  }

  for (const t of tickets) {
    const beh = t.status?.behavior;
    if (beh && byStatusBehavior[beh] !== undefined) {
      byStatusBehavior[beh]++;
    }

    if (t.priorityId) {
      if (!priorityMap.has(t.priorityId)) {
        priorityMap.set(t.priorityId, {
          priorityId: t.priorityId,
          label: t.priority?.label || `Priority #${t.priorityId}`,
          sortOrder: t.priority?.sortOrder ?? 999,
          count: 0,
        });
      }
      priorityMap.get(t.priorityId).count++;
    }

    // Only tally global statuses into byStatus map; team-specific statuses roll up into byStatusBehavior
    if (t.statusId && t.status?.teamId === null) {
      if (!statusMap.has(t.statusId)) {
        statusMap.set(t.statusId, {
          statusId: t.statusId,
          label: t.status?.label || `Status #${t.statusId}`,
          behavior: t.status?.behavior || "OPEN",
          sortOrder: t.status?.sortOrder ?? 999,
          count: 0,
        });
      }
      statusMap.get(t.statusId).count++;
    }
  }

  const byPriority = Array.from(priorityMap.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const byStatus = Array.from(statusMap.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  // Enrich with global custom colors if defined
  try {
    const { getColorRegistry } = require("../admin/color-registry.service");
    const colorRegistry = await getColorRegistry();

    for (const item of byPriority) {
      const customColor =
        colorRegistry.priorityColors?.[String(item.priorityId)] ||
        colorRegistry.priorityColors?.[`label_${(item.label || "").toLowerCase().trim()}`] ||
        colorRegistry.priorityColors?.[(item.label || "").trim()];
      if (customColor) {
        item.color = customColor;
      }
    }

    for (const item of byStatus) {
      const customColor =
        colorRegistry.statusColors?.[String(item.statusId)] ||
        colorRegistry.statusColors?.[`label_${(item.label || "").toLowerCase().trim()}`] ||
        colorRegistry.statusColors?.[(item.label || "").trim()];
      if (customColor) {
        item.color = customColor;
      }
    }
  } catch (_e) {
    // Graceful fallback to default colors
  }

  return {
    total: tickets.length,
    byStatusBehavior,
    byPriority,
    byStatus,
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
  exportTickets,
  getTicketById,
  getTicketStats,
  getAgingReport,
};

