const { AppError } = require("../../utils/errors");

// Polyfill BigInt serialization
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

/**
 * Ticket Number Generation Service (Atomic Daily UPSERT)
 */
const generateTicketNumber = async (tx, date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year2 = String(date.getFullYear()).slice(-2);
  const ddmmyy = `${day}${month}${year2}`;

  const sequenceDateStr = `${date.getFullYear()}-${month}-${day}`;

  const [row] = await tx.$queryRawUnsafe(
    `
    INSERT INTO daily_ticket_sequences ("sequenceDate", "lastValue")
    VALUES ($1::date, 1)
    ON CONFLICT ("sequenceDate")
    DO UPDATE SET "lastValue" = daily_ticket_sequences."lastValue" + 1
    RETURNING "lastValue";
  `,
    sequenceDateStr,
  );

  const counter = Number(row.lastValue);
  const ticketNumber = `RTS-${ddmmyy}${counter}`;

  return {
    ticketNumber,
    counter,
    sequenceDate: sequenceDateStr,
  };
};

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

const TICKET_DETAIL_INCLUDE = {
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
};

module.exports = {
  generateTicketNumber,
  handleTicketDbErrors,
  TICKET_DETAIL_INCLUDE,
};
