const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  handleTicketDbErrors,
  TICKET_DETAIL_INCLUDE,
} = require("./ticket-common.service");
const {
  validateAndFormatFieldValue,
} = require("../../controllers/master-data/field-definition.helper");

/**
 * Updates an existing Ticket (summary, description, custom fields).
 * - Gated by TICKET_UPDATE (Admin GLOBAL, User ASSIGNED).
 * - Enforces ticket is not CLOSED.
 * - Supports optimistic concurrency control via `version` field.
 * - Validates and formats custom field values.
 * - Records TICKET_UPDATED in TicketHistory.
 */
const updateTicket = async (ticketId, data, user, isGlobalScope = false) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      status: { select: { behavior: true } },
      team: { select: { id: true, departmentId: true } },
      customFieldValues: true,
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot update a closed ticket", 400);
  }

  // Optimistic concurrency check
  if (data.version !== undefined && data.version !== ticket.version) {
    throw new AppError(
      "Conflict: Ticket has been modified by another transaction. Please reload.",
      409,
    );
  }

  // If summary changed, check duplicate active ticket in same project & team
  if (data.summary && data.summary.trim() !== ticket.summary) {
    const existing = await prisma.ticket.findFirst({
      where: {
        projectId: ticket.projectId,
        teamId: ticket.teamId,
        summary: { equals: data.summary.trim(), mode: "insensitive" },
        status: {
          behavior: { not: "CLOSED" },
        },
        NOT: { id: ticket.id },
      },
    });

    if (existing) {
      throw new AppError(
        `An active ticket with this summary already exists for this project and team (${existing.ticketNumber})`,
        409,
      );
    }
  }

  // Validate custom fields if provided
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
      if (def.teamId !== null && def.teamId !== ticket.teamId) {
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

  try {
    return await prisma.$transaction(async (tx) => {
      const previousValues = {};
      const newValues = {};

      const updatePayload = {
        version: { increment: 1 },
      };

      if (data.summary !== undefined && data.summary.trim() !== ticket.summary) {
        previousValues.summary = ticket.summary;
        newValues.summary = data.summary.trim();
        updatePayload.summary = data.summary.trim();
      }

      if (data.description !== undefined && data.description.trim() !== ticket.description) {
        previousValues.description = ticket.description;
        newValues.description = data.description.trim();
        updatePayload.description = data.description.trim();
      }

      // Update ticket row
      await tx.ticket.update({
        where: { id: ticket.id },
        data: updatePayload,
      });

      // Upsert custom fields
      for (const cf of formattedCustomFields) {
        await tx.ticketFieldValue.upsert({
          where: {
            ticketId_fieldDefinitionId: {
              ticketId: ticket.id,
              fieldDefinitionId: cf.fieldDefinitionId,
            },
          },
          create: {
            ticketId: ticket.id,
            fieldDefinitionId: cf.fieldDefinitionId,
            textValue: cf.textValue,
            numberValue: cf.numberValue,
            decimalValue: cf.decimalValue,
            booleanValue: cf.booleanValue,
            dateValue: cf.dateValue,
            selectedOptions: cf.selectedOptions,
          },
          update: {
            textValue: cf.textValue,
            numberValue: cf.numberValue,
            decimalValue: cf.decimalValue,
            booleanValue: cf.booleanValue,
            dateValue: cf.dateValue,
            selectedOptions: cf.selectedOptions,
          },
        });
        newValues[`customField_${cf.fieldDefinitionId}`] = cf.textValue || cf.numberValue || cf.decimalValue || cf.booleanValue || cf.dateValue || cf.selectedOptions;
      }

      // Record change in history
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "CUSTOM_FIELD_CHANGED",
          previousValue: Object.keys(previousValues).length > 0 ? JSON.stringify(previousValues) : null,
          newValue: JSON.stringify(newValues),
          remarks: data.remarks || "Ticket updated",
          updatedById: user.id,
        },
      });

      return tx.ticket.findUnique({
        where: { id: ticket.id },
        include: TICKET_DETAIL_INCLUDE,
      });
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  updateTicket,
};
