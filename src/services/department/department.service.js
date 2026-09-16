const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Department Service (Phase 5 Master Data Management)
 */

const createDepartment = async (data, adminUserId) => {
  // Pre-check for duplicate name
  const existing = await prisma.department.findUnique({
    where: { name: data.name },
  });
  if (existing) {
    throw new AppError("A department with this name already exists", 400);
  }

  try {
    return await prisma.department.create({
      data: {
        name: data.name,
        description: data.description || null,
        status: data.status || "ACTIVE",
        createdById: adminUserId,
      },
      include: {
        _count: {
          select: { teams: true, users: true },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("A department with this name already exists", 400);
    }
    throw error;
  }
};

const listDepartments = async ({ status, includeInactive = false }) => {
  const where = {};
  if (includeInactive) {
    if (status) where.status = status;
  } else {
    where.status = status || "ACTIVE";
  }

  return prisma.department.findMany({
    where,
    include: {
      _count: {
        select: { teams: true, users: true },
      },
    },
    orderBy: { name: "asc" },
  });
};

const getDepartmentById = async (id) => {
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

  return department;
};

const updateDepartment = async (id, data) => {
  const existing = await prisma.department.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Department not found", 404);
  }

  if (data.name && data.name !== existing.name) {
    const duplicate = await prisma.department.findUnique({
      where: { name: data.name },
    });
    if (duplicate && duplicate.id !== id) {
      throw new AppError("A department with this name already exists", 400);
    }
  }

  try {
    return await prisma.department.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
      include: {
        _count: {
          select: { teams: true, users: true },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("A department with this name already exists", 400);
    }
    throw error;
  }
};

const retireDepartment = async (id) => {
  const existing = await prisma.department.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Department not found", 404);
  }

  return prisma.department.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

module.exports = {
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  retireDepartment,
};
