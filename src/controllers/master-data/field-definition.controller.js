const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  validateAndFormatFieldValue,
} = require("./field-definition.helper");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

const createFieldDefinition = async (req, res, next) => {
  try {
    const data = req.body;
    const adminUserId = req.user.id;
    const targetTeamId = data.teamId ? Number(data.teamId) : null;

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
      const created = await prisma.ticketFieldDefinition.create({
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

      await invalidateCachePattern("masterdata:ticket-fields:*");

      return res.status(201).json({
        status: "success",
        data: created,
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
  } catch (error) {
    next(error);
  }
};

const listFieldDefinitions = async (req, res, next) => {
  try {
    const { teamId, includeInactive, all } = req.query;
    const shouldIncludeInactive =
      includeInactive === "true" || includeInactive === true;
    const isAll = all === "true" || teamId === "all";

    const where = {};

    if (!shouldIncludeInactive) {
      where.status = "ACTIVE";
    }

    if (isAll) {
      // No scoping filter
    } else if (teamId !== undefined && teamId !== null && teamId !== "") {
      where.OR = [{ teamId: null }, { teamId: Number(teamId) }];
    } else {
      where.teamId = null;
    }

    const cacheKey = `masterdata:ticket-fields:${serializeQueryParams(req.query)}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.ticketFieldDefinition.findMany({
        where,
        include: {
          team: { select: { id: true, name: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
    );

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getFieldDefinitionById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const definition = await prisma.ticketFieldDefinition.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    if (!definition) {
      throw new AppError("Ticket field definition not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: definition,
    });
  } catch (error) {
    next(error);
  }
};

const updateFieldDefinition = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const existing = await prisma.ticketFieldDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError("Ticket field definition not found", 404);
    }

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

    if (
      data.name &&
      (data.name !== existing.name || data.teamId !== undefined)
    ) {
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
      const updated = await prisma.ticketFieldDefinition.update({
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

      await invalidateCachePattern("masterdata:ticket-fields:*");

      return res.status(200).json({
        status: "success",
        data: updated,
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
  } catch (error) {
    next(error);
  }
};

const retireFieldDefinition = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.ticketFieldDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError("Ticket field definition not found", 404);
    }

    const data = await prisma.ticketFieldDefinition.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await invalidateCachePattern("masterdata:ticket-fields:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFieldDefinition,
  listFieldDefinitions,
  getFieldDefinitionById,
  updateFieldDefinition,
  retireFieldDefinition,
  validateAndFormatFieldValue,
};
