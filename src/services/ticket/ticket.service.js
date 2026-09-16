const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { generateTicketNumber } = require("./ticket-number.service");
const {
  validateAndFormatFieldValue,
} = require("../ticket-field/ticket-field.service");

// Polyfill BigInt serialization
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

/**
 * Maps raw database trigger and constraint violations to user-friendly AppError instances.
 */
const handleTicketDbErrors = (error) => {
  if (error instanceof AppError) {
    throw error;
  }

  // Intercept trigger: fn_enforce_assignee_team_and_dept
  if (
    error.message?.includes("Cross-department assignment not allowed") ||
    error.message?.includes("enforce_assignee_team_and_dept") ||
    error.message?.includes("fn_enforce_assignee_team_and_dept")
  ) {
    throw new AppError(
      "Cannot assign user — assignee must belong to the same department as the team",
      400,
    );
  }

  // Intercept trigger: fn_enforce_ticket_team_not_primary
  if (
    error.message?.includes("Primary team cannot be added as collaborating team") ||
    error.message?.includes("enforce_ticket_team_not_primary") ||
    error.message?.includes("fn_enforce_ticket_team_not_primary")
  ) {
    throw new AppError(
      "Cannot add ticket's primary team as a collaborating team",
      400,
    );
  }

  // Intercept trigger: fn_enforce_ticket_team_department
  if (
    error.message?.includes("Collaborating team must be in the same department") ||
    error.message?.includes("enforce_ticket_team_department") ||
    error.message?.includes("fn_enforce_ticket_team_department")
  ) {
    throw new AppError(
      "Collaborating team must belong to the same department as the ticket's primary team",
      400,
    );
  }

  // Intercept partial unique constraint: uq_ticket_team_active
  if (
    error.message?.includes("uq_ticket_team_active") ||
    (error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("teamId") &&
      error.meta.target.includes("ticketId"))
  ) {
    throw new AppError(
      "Team is already an active collaborating team on this ticket",
      400,
    );
  }

  // Intercept partial unique constraint: uq_assignee_active
  if (
    error.message?.includes("uq_assignee_active") ||
    (error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("userId") &&
      error.meta.target.includes("ticketId"))
  ) {
    throw new AppError("User is already an active assignee on this ticket", 400);
  }

  // Intercept trigger: fn_enforce_ticket_status_team
  if (
    error.message?.includes("which is neither the primary team nor an active collaborating team") ||
    error.message?.includes("enforce_ticket_status_team") ||
    error.message?.includes("fn_enforce_ticket_status_team")
  ) {
    throw new AppError(
      "The selected ticket status does not belong to this team or global statuses",
      400,
    );
  }

  // Intercept self-parent check constraint: chk_ticket_not_self_parent / chk_no_self_parenting
  if (
    error.message?.includes("chk_ticket_not_self_parent") ||
    error.message?.includes("chk_no_self_parenting") ||
    error.message?.includes("parentTicketId")
  ) {
    throw new AppError("A ticket cannot be its own parent ticket", 400);
  }

  // Intercept trigger: fn_enforce_ticket_field_value_team_scope
  if (
    error.message?.includes("enforce_ticket_field_value_team_scope") ||
    error.message?.includes("fn_enforce_ticket_field_value_team_scope")
  ) {
    throw new AppError(
      "Custom field does not belong to this team or global fields",
      400,
    );
  }

  // Intercept attachment file size constraint: chk_file_size_positive / chk_attachment_file_size_positive
  if (
    error.message?.includes("chk_file_size_positive") ||
    error.message?.includes("chk_attachment_file_size_positive") ||
    error.message?.includes("fileSizeBytes")
  ) {
    throw new AppError("Attachment file size must be greater than 0 bytes", 400);
  }

  throw error;
};

/**
 * Ticket Service (Phase 6 Ticket Core & Phase 7 Collaboration)
 */

/**
 * Creates a new Ticket with assignees, optional custom fields, and initial history.
 * - Admin (GLOBAL): can create tickets for any team.
 * - User (TEAM): can only create tickets for teams where they hold active UserTeam membership.
 * - Enforces cross-department assignee restriction (assignee.departmentId === team.departmentId).
 * - Enforces status team-scoping rules (status.teamId IS NULL OR status.teamId === team.id).
 * - Generates transaction-safe sequential ticket number via DailyTicketSequence.
 */
const createTicket = async (data, user, isGlobalScope = false) => {
  const targetTeamId = Number(data.teamId);

  // 1. Team-scope check for standard users
  if (!isGlobalScope) {
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: user.id,
        teamId: targetTeamId,
        removedAt: null,
      },
    });
    if (!userTeam) {
      throw new AppError(
        "You can only create tickets for teams you are an active member of",
        403,
      );
    }
  }

  // 2. Validate Team exists and is active
  const team = await prisma.team.findUnique({
    where: { id: targetTeamId },
    include: { department: { select: { id: true, name: true } } },
  });
  if (!team) {
    throw new AppError("Team not found", 404);
  }
  if (team.status !== "ACTIVE") {
    throw new AppError("Cannot create ticket for an inactive team", 400);
  }

  // 3. Validate Project exists and is active
  const project = await prisma.project.findUnique({
    where: { id: Number(data.projectId) },
  });
  if (!project) {
    throw new AppError("Project not found", 404);
  }
  if (project.status !== "ACTIVE") {
    throw new AppError("Cannot create ticket for an inactive project", 400);
  }

  // 4. Validate Priority exists and is active
  const priority = await prisma.priorityLevel.findUnique({
    where: { id: Number(data.priorityId) },
  });
  if (!priority) {
    throw new AppError("Priority level not found", 404);
  }
  if (priority.status !== "ACTIVE") {
    throw new AppError("Cannot select an inactive priority level", 400);
  }

  // 5. Validate or resolve Status
  let resolvedStatus = null;
  if (data.statusId) {
    const status = await prisma.ticketStatus.findUnique({
      where: { id: Number(data.statusId) },
    });
    if (!status) {
      throw new AppError("Ticket status not found", 404);
    }
    if (status.status !== "ACTIVE") {
      throw new AppError("Cannot select an inactive ticket status", 400);
    }
    // Check team scoping
    if (status.teamId !== null && status.teamId !== team.id) {
      throw new AppError(
        "The selected ticket status does not belong to this team or global statuses",
        400,
      );
    }
    resolvedStatus = status;
  } else {
    // Default to the team's Open status (prefer team-specific Open over global)
    resolvedStatus = await prisma.ticketStatus.findFirst({
      where: {
        behavior: "OPEN",
        status: "ACTIVE",
        teamId: team.id,
      },
      orderBy: { sortOrder: "asc" },
    });

    if (!resolvedStatus) {
      resolvedStatus = await prisma.ticketStatus.findFirst({
        where: {
          behavior: "OPEN",
          status: "ACTIVE",
          teamId: null,
        },
        orderBy: { sortOrder: "asc" },
      });
    }

    if (!resolvedStatus) {
      throw new AppError("No active Open status found for this team", 400);
    }
  }

  // 6. Validate Assignees (at least 1, must be active and in same Department as Team)
  if (!Array.isArray(data.assigneeIds) || data.assigneeIds.length === 0) {
    throw new AppError("A ticket must have at least one assignee", 400);
  }

  const uniqueAssigneeIds = [...new Set(data.assigneeIds.map(Number))];
  const assignees = await prisma.user.findMany({
    where: {
      id: { in: uniqueAssigneeIds },
      status: "ACTIVE",
    },
    select: { id: true, name: true, departmentId: true },
  });

  if (assignees.length !== uniqueAssigneeIds.length) {
    throw new AppError(
      "One or more assignees are invalid, duplicate, or inactive",
      400,
    );
  }

  // Enforce department match
  for (const a of assignees) {
    if (a.departmentId !== team.departmentId) {
      throw new AppError(
        `Cannot assign user "${a.name}" (id=${a.id}) — assignee must belong to the same department as the team`,
        400,
      );
    }
  }

  // 7. Validate parentTicketId if provided
  if (data.parentTicketId) {
    const parentTicket = await prisma.ticket.findUnique({
      where: { id: Number(data.parentTicketId) },
    });
    if (!parentTicket) {
      throw new AppError("Parent ticket not found", 404);
    }
  }

  // 8. Validate and format Custom Fields if provided
  const formattedCustomFields = [];
  if (Array.isArray(data.customFields) && data.customFields.length > 0) {
    for (const cf of data.customFields) {
      const def = await prisma.ticketFieldDefinition.findUnique({
        where: { id: Number(cf.fieldDefinitionId) },
      });
      if (!def) {
        throw new AppError(
          `Custom field definition (id=${cf.fieldDefinitionId}) not found`,
          404,
        );
      }
      if (def.status !== "ACTIVE") {
        throw new AppError(
          `Custom field "${def.name}" is retired/inactive`,
          400,
        );
      }
      // Scoping: must be global or match ticket team
      if (def.teamId !== null && def.teamId !== team.id) {
        throw new AppError(
          `Custom field "${def.name}" does not belong to this team or global fields`,
          400,
        );
      }

      const formatted = validateAndFormatFieldValue(def, cf.value);
      if (formatted) {
        formattedCustomFields.push(formatted);
      }
    }
  }

  // 9. Execute creation inside interactive transaction
  try {
    return await prisma.$transaction(async (tx) => {
      // 9a. Generate sequential ticket number
      const { ticketNumber } = await generateTicketNumber(tx);

      // 9b. Create ticket
      const ticket = await tx.ticket.create({
        data: {
          ticketNumber,
          projectId: project.id,
          teamId: team.id,
          summary: data.summary,
          description: data.description,
          priorityId: priority.id,
          statusId: resolvedStatus.id,
          parentTicketId: data.parentTicketId
            ? Number(data.parentTicketId)
            : null,
          createdById: user.id,
        },
      });

      // 9c. Create assignees with primary team context
      for (const assigneeId of uniqueAssigneeIds) {
        await tx.ticketAssignee.create({
          data: {
            ticketId: ticket.id,
            userId: assigneeId,
            teamId: team.id,
            assignedById: user.id,
          },
        });
      }

      // 9d. Create custom field values
      for (const cf of formattedCustomFields) {
        await tx.ticketFieldValue.create({
          data: {
            ticketId: ticket.id,
            fieldDefinitionId: cf.fieldDefinitionId,
            textValue: cf.textValue,
            numberValue: cf.numberValue,
            decimalValue: cf.decimalValue,
            booleanValue: cf.booleanValue,
            dateValue: cf.dateValue,
            selectedOptions: cf.selectedOptions,
          },
        });
      }

      // 9e. Create attachments if provided
      if (Array.isArray(data.attachments) && data.attachments.length > 0) {
        for (const att of data.attachments) {
          const originalFileName = att.originalFileName || att.fileName;
          const fileExtension =
            att.fileExtension ||
            (originalFileName && originalFileName.includes(".")
              ? originalFileName.substring(originalFileName.lastIndexOf("."))
              : null);
          const storageKey =
            att.storageKey ||
            `tickets/init/${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${originalFileName}`;

          await tx.ticketAttachment.create({
            data: {
              ticketId: ticket.id,
              uploadedById: user.id,
              originalFileName,
              storageKey,
              mimeType: att.mimeType,
              fileExtension,
              fileSizeBytes: BigInt(att.fileSizeBytes),
              checksum: att.checksum || null,
            },
          });
        }
      }

      // 9f. Create initial history record
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "CREATED",
          newStatusId: resolvedStatus.id,
          newBehavior: resolvedStatus.behavior,
          newPriorityId: priority.id,
          remarks: data.remarks || null,
          newValue: JSON.stringify({ summary: data.summary }),
          updatedById: user.id,
        },
      });

      // 9f.2 If this is a sub-ticket, record SUB_TICKET_CREATED on parent ticket history
      if (ticket.parentTicketId) {
        await tx.ticketHistory.create({
          data: {
            ticketId: ticket.parentTicketId,
            action: "SUB_TICKET_CREATED",
            newValue: JSON.stringify({
              subTicketId: ticket.id,
              subTicketNumber: ticket.ticketNumber,
              summary: ticket.summary,
            }),
            remarks: `Sub-ticket ${ticket.ticketNumber} created`,
            updatedById: user.id,
          },
        });
      }

      // 9g. Fetch complete created entity
      return tx.ticket.findUnique({
        where: { id: ticket.id },
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
        },
      });
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Lists tickets with basic filters and pagination.
 * - Admin (GLOBAL): sees all tickets.
 * - User (TEAM): sees tickets belonging to teams they are active members in.
 */
const listTickets = async ({ query, user, isGlobalScope = false }) => {
  const where = {};

  if (!isGlobalScope) {
    where.team = {
      members: {
        some: {
          userId: user.id,
          removedAt: null,
        },
      },
    };
  }

  if (query.teamId) where.teamId = Number(query.teamId);
  if (query.statusId) where.statusId = Number(query.statusId);
  if (query.priorityId) where.priorityId = Number(query.priorityId);
  if (query.projectId) where.projectId = Number(query.projectId);

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const [total, tickets] = await Promise.all([
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
        assignees: {
          where: { removedAt: null },
          select: {
            teamId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
  ]);

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

  // Non-admin scope check (member of primary team OR active collaborating team)
  if (!isGlobalScope) {
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
    where.team = {
      members: {
        some: {
          userId: user.id,
          removedAt: null,
        },
      },
    };
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

  const existingAssignment = await prisma.ticketAssignee.findFirst({
    where: {
      ticketId: ticket.id,
      userId: assigneeUser.id,
    },
  });

  if (existingAssignment && existingAssignment.removedAt === null) {
    throw new AppError("User is already an active assignee on this ticket", 400);
  }

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
      assignees: {
        where: { removedAt: null },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
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
      };
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Full Reassignment of a ticket (Admin only).
 * - Can reassign in ANY status, including CLOSED.
 * - Soft-removes all current assignees and establishes new assignees.
 * - Optionally changes primary teamId (soft-removing it from collaborating teams if present).
 * - Enforces assignee department match with target team.
 * - Records single REASSIGNED TicketHistory entry with previous & new state.
 */
const reassignTicket = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      team: { select: { id: true, name: true, departmentId: true } },
      status: { select: { id: true, behavior: true } },
      assignees: {
        where: { removedAt: null },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  let targetTeam = ticket.team;
  if (data.teamId && Number(data.teamId) !== ticket.teamId) {
    const newTeam = await prisma.team.findUnique({
      where: { id: Number(data.teamId) },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!newTeam) {
      throw new AppError("Target team not found", 404);
    }
    if (newTeam.status !== "ACTIVE") {
      throw new AppError("Cannot reassign ticket to an inactive team", 400);
    }
    targetTeam = newTeam;
  }

  if (!Array.isArray(data.assigneeIds) || data.assigneeIds.length === 0) {
    throw new AppError(
      "At least one assignee is required for reassignment",
      400,
    );
  }

  const uniqueAssigneeIds = [...new Set(data.assigneeIds.map(Number))];
  const newAssignees = await prisma.user.findMany({
    where: {
      id: { in: uniqueAssigneeIds },
      status: "ACTIVE",
    },
    select: { id: true, name: true, departmentId: true },
  });

  if (newAssignees.length !== uniqueAssigneeIds.length) {
    throw new AppError(
      "One or more assignees are invalid, duplicate, or inactive",
      400,
    );
  }

  for (const a of newAssignees) {
    if (a.departmentId !== targetTeam.departmentId) {
      throw new AppError(
        `Cannot assign user "${a.name}" (id=${a.id}) — assignee must belong to the same department as the team`,
        400,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Soft-remove all currently active assignees
      await tx.ticketAssignee.updateMany({
        where: {
          ticketId: ticket.id,
          removedAt: null,
        },
        data: {
          removedAt: new Date(),
        },
      });

      // 2. Update primary team FIRST if changed (so trigger recognizes targetTeam as primary team)
      const teamChanged = targetTeam.id !== ticket.teamId;
      if (teamChanged) {
        // Soft-remove targetTeam from collaborating teams BEFORE updating primary team
        // (so trigger enforce_ticket_team_not_primary sees targetTeam is not primary during the update)
        const removedCollab = await tx.ticketTeam.updateMany({
          where: {
            ticketId: ticket.id,
            teamId: targetTeam.id,
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
          },
        });

        if (removedCollab.count > 0) {
          await tx.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              action: "TEAM_REMOVED",
              previousTeamId: targetTeam.id,
              previousValue: JSON.stringify({
                teamId: targetTeam.id,
                name: targetTeam.name,
                reason: "Promoted to primary team via reassignment",
              }),
              updatedById: user.id,
            },
          });
        }

        // Now update ticket's primary team to targetTeam.id
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { teamId: targetTeam.id },
        });
      }

      // 3. Reactivate or create new assignees under targetTeam.id
      for (const assigneeId of uniqueAssigneeIds) {
        const existing = await tx.ticketAssignee.findFirst({
          where: {
            ticketId: ticket.id,
            userId: assigneeId,
          },
        });

        if (existing) {
          await tx.ticketAssignee.update({
            where: { id: existing.id },
            data: {
              teamId: targetTeam.id,
              removedAt: null,
              assignedAt: new Date(),
              assignedById: user.id,
            },
          });
        } else {
          await tx.ticketAssignee.create({
            data: {
              ticketId: ticket.id,
              userId: assigneeId,
              teamId: targetTeam.id,
              assignedById: user.id,
            },
          });
        }
      }

      // 4. Record single REASSIGNED entry in TicketHistory
      const wasClosed = ticket.status.behavior === "CLOSED";
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "REASSIGNED",
          previousTeamId: teamChanged ? ticket.teamId : null,
          newTeamId: teamChanged ? targetTeam.id : null,
          remarks: data.remarks || null,
          previousValue: JSON.stringify({
            teamId: ticket.teamId,
            teamName: ticket.team.name,
            assignees: ticket.assignees.map((a) => ({
              userId: a.userId,
              name: a.user.name,
            })),
          }),
          newValue: JSON.stringify({
            teamId: targetTeam.id,
            teamName: targetTeam.name,
            assignees: newAssignees.map((a) => ({
              userId: a.id,
              name: a.name,
            })),
            wasClosed,
          }),
          updatedById: user.id,
        },
      });

      // 5. Return updated ticket
      return tx.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
          assignees: {
            where: { removedAt: null },
            select: {
              id: true,
              userId: true,
              assignedAt: true,
              teamId: true,
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
            include: {
              team: {
                select: { id: true, name: true, departmentId: true },
              },
            },
          },
        },
      });
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Adds a collaborating team to a ticket (Admin only).
 * - Enforces that collaborating team is not the ticket's primary team.
 * - Enforces that collaborating team is active and in the same department as the primary team.
 * - Enforces partial unique constraint: cannot duplicate active collaborating team.
 * - Records TEAM_ADDED in TicketHistory.
 */
const addCollaboratingTeam = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      team: { select: { id: true, name: true, departmentId: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const targetTeamId = Number(data.teamId);

  if (targetTeamId === ticket.teamId) {
    throw new AppError(
      "Cannot add ticket's primary team as a collaborating team",
      400,
    );
  }

  const collabTeam = await prisma.team.findUnique({
    where: { id: targetTeamId },
    select: { id: true, name: true, status: true, departmentId: true },
  });

  if (!collabTeam) {
    throw new AppError("Team not found", 404);
  }
  if (collabTeam.status !== "ACTIVE") {
    throw new AppError("Cannot add an inactive team as collaborating team", 400);
  }
  if (collabTeam.departmentId !== ticket.team.departmentId) {
    throw new AppError(
      "Collaborating team must belong to the same department as the ticket's primary team",
      400,
    );
  }

  const existingTeam = await prisma.ticketTeam.findFirst({
    where: {
      ticketId: ticket.id,
      teamId: targetTeamId,
    },
  });

  if (existingTeam && existingTeam.removedAt === null) {
    throw new AppError(
      "Team is already an active collaborating team on this ticket",
      400,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let teamRecord;
      if (existingTeam) {
        teamRecord = await tx.ticketTeam.update({
          where: { id: existingTeam.id },
          data: {
            removedAt: null,
            assignedAt: new Date(),
            assignedById: user.id,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true },
            },
          },
        });
      } else {
        teamRecord = await tx.ticketTeam.create({
          data: {
            ticketId: ticket.id,
            teamId: targetTeamId,
            assignedById: user.id,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true },
            },
          },
        });
      }

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "TEAM_ADDED",
          newTeamId: targetTeamId,
          newValue: JSON.stringify({
            teamId: targetTeamId,
            name: collabTeam.name,
          }),
          updatedById: user.id,
        },
      });

      return teamRecord;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Removes a collaborating team from a ticket (soft removal, Admin only).
 * - Records TEAM_REMOVED in TicketHistory.
 */
const removeCollaboratingTeam = async (ticketId, targetTeamId, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      collaboratingTeams: {
        where: { removedAt: null },
        include: {
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const collabTeam = ticket.collaboratingTeams.find(
    (ct) => ct.teamId === Number(targetTeamId),
  );

  if (!collabTeam) {
    throw new AppError(
      "Team is not an active collaborating team on this ticket",
      404,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.ticketTeam.update({
        where: { id: collabTeam.id },
        data: {
          removedAt: new Date(),
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "TEAM_REMOVED",
          previousTeamId: collabTeam.teamId,
          previousValue: JSON.stringify({
            teamId: collabTeam.teamId,
            name: collabTeam.team.name,
          }),
          updatedById: user.id,
        },
      });

      return {
        message: "Collaborating team removed successfully",
        teamId: collabTeam.teamId,
      };
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

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
      priority: { select: { id: true, label: true, sortOrder: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const newPriorityId = Number(data.priorityId);
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

      return updatedTicket;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  createTicket,
  listTickets,
  getTicketById,
  getTicketStats,
  addTicketAssignee,
  removeTicketAssignee,
  reassignTicket,
  addCollaboratingTeam,
  removeCollaboratingTeam,
  changeTicketStatus,
  closeTicket,
  changeTicketPriority,
};
