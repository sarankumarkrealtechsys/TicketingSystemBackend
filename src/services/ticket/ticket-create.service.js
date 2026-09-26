const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  generateTicketNumber,
  handleTicketDbErrors,
  TICKET_DETAIL_INCLUDE,
} = require("./ticket-common.service");
const {
  validateAndFormatFieldValue,
} = require("../../controllers/master-data/field-definition.helper");
const inAppNotificationService = require("../notification/in-app-notification.service");
const { logger } = require("../../config/logger");

/**
 * Creates a new Ticket with assignees, optional custom fields, and initial history.
 * - Admin (GLOBAL): can create tickets for any team.
 * - Any authenticated user with TICKET_CREATE can raise tickets for any active team.
 * - Enforces cross-department assignee restriction (assignee.departmentId === team.departmentId).
 * - Enforces status team-scoping rules (status.teamId IS NULL OR status.teamId === team.id).
 * - Generates transaction-safe sequential ticket number via DailyTicketSequence.
 */
const createTicket = async (data, user, isGlobalScope = false) => {
  const targetTeamId = Number(data.teamId);

  // 1. Validate Team exists and is active
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

  // 2. Validate Project exists and is active
  const project = await prisma.project.findUnique({
    where: { id: Number(data.projectId) },
  });
  if (!project) {
    throw new AppError("Project not found", 404);
  }
  if (project.status !== "ACTIVE") {
    throw new AppError("Cannot create ticket for an inactive project", 400);
  }

  // Prevent duplicate active ticket with identical summary for this project and team
  const existingActiveTicket = await prisma.ticket.findFirst({
    where: {
      projectId: project.id,
      teamId: team.id,
      summary: { equals: data.summary.trim(), mode: "insensitive" },
      status: {
        behavior: { not: "CLOSED" },
      },
    },
    select: { id: true, ticketNumber: true },
  });
  if (existingActiveTicket) {
    throw new AppError(
      `An active ticket with this summary already exists for this project and team (${existingActiveTicket.ticketNumber})`,
      409,
    );
  }

  // 3. Validate Priority exists and is active
  const priority = await prisma.priorityLevel.findUnique({
    where: { id: Number(data.priorityId) },
  });
  if (!priority) {
    throw new AppError("Priority level not found", 404);
  }
  if (priority.status !== "ACTIVE") {
    throw new AppError("Cannot select an inactive priority level", 400);
  }

  // 4. Validate or resolve Status
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
    if (status.behavior !== "OPEN") {
      throw new AppError("Newly created tickets must have an OPEN status", 400);
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

  // 5. Validate Assignees (at least 1, must be active and in same Department as Team)
  if (!Array.isArray(data.assigneeIds) || data.assigneeIds.length === 0) {
    throw new AppError("A ticket must have at least one assignee", 400);
  }

  if (data.assigneeIds.length !== new Set(data.assigneeIds.map(Number)).size) {
    throw new AppError("Duplicate assignee IDs provided in request", 400);
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

  // 6. Validate parentTicketId if provided
  if (data.parentTicketId) {
    const parentTicket = await prisma.ticket.findUnique({
      where: { id: Number(data.parentTicketId) },
      select: {
        id: true,
        ticketNumber: true,
        parentTicketId: true,
        status: {
          select: { behavior: true },
        },
      },
    });
    if (!parentTicket) {
      throw new AppError("Parent ticket not found", 404);
    }
    if (parentTicket.status?.behavior === "CLOSED") {
      throw new AppError(
        `Cannot create a sub-ticket under closed ticket #${parentTicket.ticketNumber}. Re-open the parent ticket first.`,
        400,
      );
    }
    if (parentTicket.parentTicketId) {
      throw new AppError(
        "Multi-level nesting is not supported. Sub-tickets can only be created under primary tickets.",
        400,
      );
    }
  }

  // 7. Validate and format Custom Fields if provided
  const formattedCustomFields = [];
  if (Array.isArray(data.customFields) && data.customFields.length > 0) {
    const fieldDefIds = data.customFields.map((cf) => Number(cf.fieldDefinitionId));
    if (fieldDefIds.length !== new Set(fieldDefIds).size) {
      throw new AppError("Duplicate custom field definitions provided in request", 400);
    }
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

  // 8. Execute creation inside interactive transaction
  try {
    const createdTicket = await prisma.$transaction(async (tx) => {
      // 8a. Generate sequential ticket number
      const { ticketNumber } = await generateTicketNumber(tx);

      // 8b. Create ticket
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

      // 9c.2 Create collaborating teams if provided
      if (Array.isArray(data.collaboratingTeamIds) && data.collaboratingTeamIds.length > 0) {
        const uniqueCollabTeamIds = [...new Set(data.collaboratingTeamIds.map(Number))].filter(
          (id) => id !== team.id
        );

        // Validate all collaborating teams exist and are active
        if (uniqueCollabTeamIds.length > 0) {
          const collabTeams = await tx.team.findMany({
            where: { id: { in: uniqueCollabTeamIds } },
            select: { id: true, status: true, name: true },
          });
          if (collabTeams.length !== uniqueCollabTeamIds.length) {
            const foundIds = new Set(collabTeams.map((t) => t.id));
            const missing = uniqueCollabTeamIds.filter((id) => !foundIds.has(id));
            throw new AppError(
              `Collaborating team(s) not found: ${missing.join(", ")}`,
              404,
            );
          }
          const inactiveTeams = collabTeams.filter((t) => t.status !== "ACTIVE");
          if (inactiveTeams.length > 0) {
            throw new AppError(
              `Cannot add inactive collaborating team(s): ${inactiveTeams.map((t) => t.name).join(", ")}`,
              400,
            );
          }
        }

        for (const collabTeamId of uniqueCollabTeamIds) {
          await tx.ticketTeam.create({
            data: {
              ticketId: ticket.id,
              teamId: collabTeamId,
              assignedById: user.id,
            },
          });
        }
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
        include: TICKET_DETAIL_INCLUDE,
      });
    });

    // 10. Dispatch in-app notifications to external assignees post-commit (exclude creator)
    const externalAssigneeIds = uniqueAssigneeIds.filter((id) => id !== user.id);
    if (externalAssigneeIds.length > 0 && createdTicket) {
      setImmediate(async () => {
        for (const assigneeId of externalAssigneeIds) {
          try {
            const isSub = Boolean(createdTicket.parentTicketId);
            await inAppNotificationService.dispatchAndPersistNotification({
              userId: assigneeId,
              actorId: user.id,
              ticketId: createdTicket.id,
              type: "TICKET_ASSIGNED",
              title: isSub
                ? `Assigned to Sub-ticket #${createdTicket.ticketNumber}`
                : `Assigned to Ticket #${createdTicket.ticketNumber}`,
              message: isSub
                ? `${user.name} assigned you to sub-ticket #${createdTicket.ticketNumber}: "${createdTicket.summary}"`
                : `${user.name} assigned you to ticket #${createdTicket.ticketNumber}: "${createdTicket.summary}"`,
            });
          } catch (err) {
            logger.error(
              `[InAppNotification] Failed to dispatch notification for ticket #${createdTicket.ticketNumber} to user ${assigneeId}: ${err.message}`,
            );
          }
        }
      });
    }

    return createdTicket;
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  createTicket,
};
