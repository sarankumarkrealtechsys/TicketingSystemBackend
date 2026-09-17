const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
} = require("../../utils/cache");

// ============================================================================
// DEPARTMENT CONTROLLER (Direct DB Operations with Redis Caching)
// ============================================================================

const createDepartment = async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const adminUserId = req.user.id;

    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) {
      throw new AppError("A department with this name already exists", 400);
    }

    try {
      const data = await prisma.department.create({
        data: {
          name,
          description: description || null,
          status: status || "ACTIVE",
          createdById: adminUserId,
        },
        include: {
          _count: {
            select: { teams: true, users: true },
          },
        },
      });

      await invalidateCachePattern("masterdata:departments:*");

      return res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A department with this name already exists", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const listDepartments = async (req, res, next) => {
  try {
    const { status, includeInactive } = req.query;
    const shouldIncludeInactive = includeInactive === "true" || includeInactive === true;

    const where = {};
    if (shouldIncludeInactive) {
      if (status) where.status = status;
    } else {
      where.status = status || "ACTIVE";
    }

    const cacheKey = `masterdata:departments:${serializeQueryParams(req.query)}`;

    const data = await getOrSetCache(cacheKey, 300, () =>
      prisma.department.findMany({
        where,
        include: {
          _count: {
            select: { teams: true, users: true },
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

const getDepartmentById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { teams: true, users: true },
        },
      },
    });

    if (!department) {
      throw new AppError("Department not found", 404);
    }

    return res.status(200).json({
      status: "success",
      data: department,
    });
  } catch (error) {
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, status } = req.body;

    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Department not found", 404);
    }

    if (name && name !== existing.name) {
      const duplicate = await prisma.department.findUnique({ where: { name } });
      if (duplicate && duplicate.id !== id) {
        throw new AppError("A department with this name already exists", 400);
      }
    }

    try {
      const data = await prisma.department.update({
        where: { id },
        data: {
          name: name !== undefined ? name : undefined,
          description: description !== undefined ? description : undefined,
          status: status !== undefined ? status : undefined,
        },
        include: {
          _count: {
            select: { teams: true, users: true },
          },
        },
      });

      await invalidateCachePattern("masterdata:departments:*");

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new AppError("A department with this name already exists", 400);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const retireDepartment = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Department not found", 404);
    }

    const data = await prisma.department.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await invalidateCachePattern("masterdata:departments:*");

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  retireDepartment,
};
