const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

// ============================================================================
// PRIORITY LEVEL CONTROLLER (Direct DB Operations with Redis Caching)
// ============================================================================

const createPriority = async (req, res, next) => {
  try {
    const { label, sortOrder, status } = req.body;
    const adminUserId = req.user.id;

    const existing = await prisma.priorityLevel.findUnique({ where: { label } });
    if (existing) {
      throw new AppError("A priority level with this label already exists", 400);
    }

    try {
      const data = await prisma.priorityLevel.create({
        data: {
          label,
          sortOrder: sortOrder !== undefined ? sortOrder : 0,
          status: status || "ACTIVE",
          createdById: adminUserId,
        },
      });

      await Promise.all([
        invalidateCachePattern("masterdata:priority-levels:*"),
        invalidateCachePattern("ticket-stats:*"),
      ]);

      return res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A priority level with this label already exists", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const listPriorities = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === true;

    const where = {};
    if (!includeInactive) {
      where.status = "ACTIVE";
    }

    const cacheKey = `masterdata:priority-levels:${serializeQueryParams(req.query)}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.priorityLevel.findMany({
        where,
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

const getPriorityById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const priority = await prisma.priorityLevel.findUnique({ where: { id } });
    if (!priority) {
      throw new AppError("Priority level not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: priority,
    });
  } catch (error) {
    next(error);
  }
};

const priorityService = require("../../services/master-data/priority.service");

const updatePriority = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await priorityService.updatePriority(id, req.body, req.user);
    await Promise.all([
      invalidateCachePattern("masterdata:priority-levels:*"),
      invalidateCachePattern("ticket-stats:*"),
    ]);

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const retirePriority = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await priorityService.retirePriority(id, req.user);
    await Promise.all([
      invalidateCachePattern("masterdata:priority-levels:*"),
      invalidateCachePattern("ticket-stats:*"),
    ]);

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const deletePriorityPermanently = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await priorityService.deletePriorityPermanently(id, req.user);
    await Promise.all([
      invalidateCachePattern("masterdata:priority-levels:*"),
      invalidateCachePattern("ticket-stats:*"),
    ]);

    return res.status(200).json({
      status: "success",
      message: `Priority level "${data.label}" permanently deleted`,
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPriority,
  listPriorities,
  getPriorityById,
  updatePriority,
  retirePriority,
  deletePriorityPermanently,
};
