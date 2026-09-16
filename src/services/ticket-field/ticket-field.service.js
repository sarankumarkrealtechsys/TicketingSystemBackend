const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

// Polyfill BigInt serialization for JSON if not already present
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

/**
 * Ticket Field Definition Service (Phase 6 Dynamic Custom Fields)
 */

const createFieldDefinition = async (data, adminUserId) => {
  const targetTeamId = data.teamId ? Number(data.teamId) : null;

  // If teamId is specified, verify the team exists and is active
  if (targetTeamId) {
    const team = await prisma.team.findUnique({
      where: { id: targetTeamId },
    });
    if (!team) {
      throw new AppError("Team not found", 404);
    }
    if (team.status !== "ACTIVE") {
      throw new AppError(
        "Cannot create custom field for an inactive team",
        400,
      );
    }
  }

  // Pre-check case-insensitive uniqueness in target scope
  const existing = await prisma.ticketFieldDefinition.findFirst({
    where: {
      name: { equals: data.name, mode: "insensitive" },
      teamId: targetTeamId,
    },
  });
  if (existing) {
    throw new AppError(
      targetTeamId
        ? "A custom field with this name already exists for this team"
        : "A custom field with this name already exists globally",
      400,
    );
  }

  try {
    return await prisma.ticketFieldDefinition.create({
      data: {
        name: data.name,
        description: data.description || null,
        fieldType: data.fieldType,
        isRequired: data.isRequired !== undefined ? data.isRequired : false,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : 0,
        options: data.options || null,
        teamId: targetTeamId,
        status: data.status || "ACTIVE",
        createdById: adminUserId,
      },
      include: {
        team: { select: { id: true, name: true } },
      },
    });
  } catch (error) {
    if (
      error.code === "P2002" ||
      error.message?.includes("uq_ticket_field_definition_global_name") ||
      error.message?.includes("uq_ticket_field_definition_team_name")
    ) {
      throw new AppError(
        targetTeamId
          ? "A custom field with this name already exists for this team"
          : "A custom field with this name already exists globally",
        400,
      );
    }
    throw error;
  }
};

const listFieldDefinitions = async ({
  teamId,
  includeInactive = false,
  all = false,
}) => {
  const where = {};

  if (!includeInactive) {
    where.status = "ACTIVE";
  }

  if (all || teamId === "all") {
    // No scoping filter
  } else if (teamId !== undefined && teamId !== null && teamId !== "") {
    where.OR = [{ teamId: null }, { teamId: Number(teamId) }];
  } else {
    where.teamId = null;
  }

  return prisma.ticketFieldDefinition.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
};

const getFieldDefinitionById = async (id) => {
  const definition = await prisma.ticketFieldDefinition.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
    },
  });

  if (!definition) {
    throw new AppError("Ticket field definition not found", 404);
  }

  return definition;
};

const updateFieldDefinition = async (id, data) => {
  const existing = await prisma.ticketFieldDefinition.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Ticket field definition not found", 404);
  }

  // Pre-check: cannot change teamId if already referenced by any ticket
  if (data.teamId !== undefined && data.teamId !== existing.teamId) {
    const valueCount = await prisma.ticketFieldValue.count({
      where: { fieldDefinitionId: id },
    });
    if (valueCount > 0) {
      throw new AppError(
        "Cannot change team for a custom field that is already referenced by existing tickets",
        400,
      );
    }
  }

  const targetTeamId =
    data.teamId !== undefined ? data.teamId : existing.teamId;

  // Pre-check case-insensitive name uniqueness if name is updated
  if (data.name && (data.name !== existing.name || data.teamId !== undefined)) {
    const duplicate = await prisma.ticketFieldDefinition.findFirst({
      where: {
        name: { equals: data.name, mode: "insensitive" },
        teamId: targetTeamId,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new AppError(
        targetTeamId
          ? "A custom field with this name already exists for this team"
          : "A custom field with this name already exists globally",
        400,
      );
    }
  }

  try {
    return await prisma.ticketFieldDefinition.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        fieldType: data.fieldType !== undefined ? data.fieldType : undefined,
        isRequired:
          data.isRequired !== undefined ? data.isRequired : undefined,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
        options: data.options !== undefined ? data.options : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
      include: {
        team: { select: { id: true, name: true } },
      },
    });
  } catch (error) {
    if (
      error.code === "P2002" ||
      error.message?.includes("uq_ticket_field_definition_global_name") ||
      error.message?.includes("uq_ticket_field_definition_team_name")
    ) {
      throw new AppError(
        targetTeamId
          ? "A custom field with this name already exists for this team"
          : "A custom field with this name already exists globally",
        400,
      );
    }
    throw error;
  }
};

const retireFieldDefinition = async (id) => {
  const existing = await prisma.ticketFieldDefinition.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Ticket field definition not found", 404);
  }

  return prisma.ticketFieldDefinition.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

/**
 * Validates a custom field value against its definition and maps to the appropriate DB column.
 */
const validateAndFormatFieldValue = (definition, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (definition.isRequired) {
      throw new AppError(`Field "${definition.name}" is required`, 400);
    }
    return null;
  }

  const result = {
    fieldDefinitionId: definition.id,
    textValue: null,
    numberValue: null,
    decimalValue: null,
    booleanValue: null,
    dateValue: null,
    selectedOptions: null,
  };

  switch (definition.fieldType) {
    case "TEXT":
    case "LONG_TEXT": {
      result.textValue = String(rawValue);
      break;
    }

    case "NUMBER": {
      const num = Number(rawValue);
      if (isNaN(num) || !Number.isInteger(num)) {
        throw new AppError(
          `Invalid value for NUMBER field "${definition.name}". Must be an integer.`,
          400,
        );
      }
      result.numberValue = BigInt(num);
      break;
    }

    case "DECIMAL": {
      const dec = Number(rawValue);
      if (isNaN(dec)) {
        throw new AppError(
          `Invalid value for DECIMAL field "${definition.name}". Must be numeric.`,
          400,
        );
      }
      result.decimalValue = dec;
      break;
    }

    case "BOOLEAN": {
      if (typeof rawValue === "boolean") {
        result.booleanValue = rawValue;
      } else if (rawValue === "true" || rawValue === "1") {
        result.booleanValue = true;
      } else if (rawValue === "false" || rawValue === "0") {
        result.booleanValue = false;
      } else {
        throw new AppError(
          `Invalid value for BOOLEAN field "${definition.name}". Must be true or false.`,
          400,
        );
      }
      break;
    }

    case "DATE":
    case "DATETIME": {
      const parsedDate = new Date(rawValue);
      if (isNaN(parsedDate.getTime())) {
        throw new AppError(
          `Invalid date format for field "${definition.name}".`,
          400,
        );
      }
      result.dateValue = parsedDate;
      break;
    }

    case "SELECT": {
      const strVal = String(rawValue).trim();
      const validOptions = Array.isArray(definition.options)
        ? definition.options.map((o) => (typeof o === "object" ? o.value : o))
        : [];
      if (!validOptions.includes(strVal)) {
        throw new AppError(
          `Invalid option "${strVal}" for SELECT field "${definition.name}". Allowed options: ${validOptions.join(", ")}`,
          400,
        );
      }
      result.textValue = strVal;
      break;
    }

    case "MULTI_SELECT": {
      if (!Array.isArray(rawValue)) {
        throw new AppError(
          `Value for MULTI_SELECT field "${definition.name}" must be an array of selected options.`,
          400,
        );
      }
      const validOptions = Array.isArray(definition.options)
        ? definition.options.map((o) => (typeof o === "object" ? o.value : o))
        : [];
      for (const val of rawValue) {
        if (!validOptions.includes(String(val))) {
          throw new AppError(
            `Invalid option "${val}" for MULTI_SELECT field "${definition.name}". Allowed options: ${validOptions.join(", ")}`,
            400,
          );
        }
      }
      result.selectedOptions = rawValue;
      break;
    }

    case "EMAIL": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const strVal = String(rawValue).trim();
      if (!emailRegex.test(strVal)) {
        throw new AppError(
          `Invalid email format for field "${definition.name}".`,
          400,
        );
      }
      result.textValue = strVal;
      break;
    }

    case "URL": {
      try {
        new URL(String(rawValue));
        result.textValue = String(rawValue).trim();
      } catch {
        throw new AppError(
          `Invalid URL format for field "${definition.name}".`,
          400,
        );
      }
      break;
    }

    default:
      result.textValue = String(rawValue);
  }

  return result;
};

module.exports = {
  createFieldDefinition,
  listFieldDefinitions,
  getFieldDefinitionById,
  updateFieldDefinition,
  retireFieldDefinition,
  validateAndFormatFieldValue,
};
