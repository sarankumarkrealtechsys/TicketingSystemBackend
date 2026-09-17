const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { getPermissions } = require("../../services/auth/permission.service");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

// ============================================================================
// TICKET STATUS CONTROLLER (Direct DB Operations)
// ============================================================================

const statusService = require("../../services/master-data/status.service");

const createTicketStatus = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["STATUS_CREATE"]?.includes("GLOBAL");

    const created = await statusService.createStatus(
      req.body,
      req.user,
      isGlobalScope,
    );

    await invalidateCachePattern("masterdata:ticket-statuses:*");

    return res.status(201).json({
      status: "success",
      data: created,
    });
  } catch (error) {
    next(error);
  }
};

const listTicketStatuses = async (req, res, next) => {
  try {
    const { teamId, includeInactive, all } = req.query;
    const shouldIncludeInactive = includeInactive === "true" || includeInactive === true;
    const isAll = all === "true" || teamId === "all";

    const where = {};

    if (!shouldIncludeInactive) {
      where.status = "ACTIVE";
    }

    if (isAll) {
      // No team scoping filter
    } else if (teamId !== undefined && teamId !== null && teamId !== "") {
      where.OR = [{ teamId: null }, { teamId: Number(teamId) }];
    } else {
      where.teamId = null;
    }

    const cacheKey = `masterdata:ticket-statuses:${serializeQueryParams(req.query)}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.ticketStatus.findMany({
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

const getTicketStatusById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const status = await prisma.ticketStatus.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    if (!status) {
      throw new AppError("Ticket status not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

const updateTicketStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await statusService.updateStatus(id, req.body, req.user);
    await invalidateCachePattern("masterdata:ticket-statuses:*");

    return res.status(200).json({
      status: "success",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

const retireTicketStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await statusService.retireStatus(id, req.user);
    await invalidateCachePattern("masterdata:ticket-statuses:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTicketStatus,
  listTicketStatuses,
  getTicketStatusById,
  updateTicketStatus,
  retireTicketStatus,
};
