const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

// ============================================================================
// PROJECT CONTROLLER (Direct DB Operations with Redis Caching)
// ============================================================================

const createProject = async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const adminUserId = req.user.id;

    const existing = await prisma.project.findUnique({ where: { name } });
    if (existing) {
      throw new AppError("A project with this name already exists", 400);
    }

    try {
      const data = await prisma.project.create({
        data: {
          name,
          description: description || null,
          status: status || "ACTIVE",
          createdById: adminUserId,
        },
        include: {
          _count: {
            select: { tickets: true },
          },
        },
      });

      await invalidateCachePattern("masterdata:projects:*");

      return res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A project with this name already exists", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const listProjects = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === true;

    const where = {};
    if (!includeInactive) {
      where.status = "ACTIVE";
    }

    const cacheKey = `masterdata:projects:${serializeQueryParams(req.query)}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.project.findMany({
        where,
        include: {
          _count: {
            select: { tickets: true },
          },
        },
        orderBy: { name: "asc" },
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

const getProjectById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, status } = req.body;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Project not found", 404);
    }

    if (name && name !== existing.name) {
      const duplicate = await prisma.project.findUnique({ where: { name } });
      if (duplicate && duplicate.id !== id) {
        throw new AppError("A project with this name already exists", 400);
      }
    }

    try {
      const data = await prisma.project.update({
        where: { id },
        data: {
          name: name !== undefined ? name : undefined,
          description: description !== undefined ? description : undefined,
          status: status !== undefined ? status : undefined,
        },
        include: {
          _count: {
            select: { tickets: true },
          },
        },
      });

      await invalidateCachePattern("masterdata:projects:*");

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A project with this name already exists", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const retireProject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Project not found", 404);
    }

    const data = await prisma.project.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await invalidateCachePattern("masterdata:projects:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  retireProject,
};
