const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Lists tickets with basic filters and pagination.
 * - Admin (GLOBAL): sees all tickets.
 * - User (TEAM): sees tickets belonging to teams they are active members in.
 */
const listTickets = async ({ query, user, isGlobalScope = false }) => {
  const where = {};

  if (!isGlobalScope) {
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

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
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
    const endMs = t.closedAt ? new Date(t.closedAt).getTime() : now;
    const diffMs = Math.max(0, endMs - new Date(t.createdAt).getTime());
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    return {
      ...t,
      subTicketsCount: t._count?.subTickets || 0,
      age: {
        hours: totalHours,
        days,
        formatted: days > 0 ? `${days}d ${hours}h` : `${totalHours}h`,
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
const getTicketById = async (id, user, isGlobalScope = false) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(id) },
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
      parentTicket: { select: { id: true, ticketNumber: true, summary: true } },
      subTickets: {
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          status: { select: { id: true, label: true, behavior: true } },
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

  return {
    ...ticket,
    subTicketsRollup: subTickets.length > 0 ? rollup : null,
  };
};

/**
 * Returns aggregated statistics for KPI dashboard cards and charts.
 * Scoped by caller's permissions (Admin sees all, User sees active team tickets).
 */
const getTicketStats = async (user, isGlobalScope = false) => {
  const where = {};

  if (!isGlobalScope) {
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

module.exports = {
  listTickets,
  getTicketById,
  getTicketStats,
};
