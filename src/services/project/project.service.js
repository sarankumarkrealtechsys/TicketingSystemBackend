const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Project Service (Phase 5 Master Data Management)
 */

const createProject = async (data, adminUserId) => {
  const existing = await prisma.project.findUnique({
    where: { name: data.name },
  });
  if (existing) {
    throw new AppError("A project with this name already exists", 400);
  }

  try {
    return await prisma.project.create({
      data: {
        name: data.name,
        description: data.description || null,
        status: data.status || "ACTIVE",
        createdById: adminUserId,
      },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("A project with this name already exists", 400);
    }
    throw error;
  }
};

const listProjects = async ({ includeInactive = false }) => {
  const where = {};
  if (!includeInactive) {
    where.status = "ACTIVE";
  }

  return prisma.project.findMany({
    where,
    include: {
      _count: {
        select: { tickets: true },
      },
    },
    orderBy: { name: "asc" },
  });
};

const getProjectById = async (id) => {
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

  return project;
};

const updateProject = async (id, data) => {
  const existing = await prisma.project.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Project not found", 404);
  }

  if (data.name && data.name !== existing.name) {
    const duplicate = await prisma.project.findUnique({
      where: { name: data.name },
    });
    if (duplicate && duplicate.id !== id) {
      throw new AppError("A project with this name already exists", 400);
    }
  }

  try {
    return await prisma.project.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("A project with this name already exists", 400);
    }
    throw error;
  }
};

const retireProject = async (id) => {
  const existing = await prisma.project.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Project not found", 404);
  }

  return prisma.project.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  retireProject,
};
