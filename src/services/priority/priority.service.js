const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Priority Level Service (Phase 5 Master Data Management)
 */

const createPriority = async (data, adminUserId) => {
  const existing = await prisma.priorityLevel.findUnique({
    where: { label: data.label },
  });
  if (existing) {
    throw new AppError(
      "A priority level with this label already exists",
      400,
    );
  }

  try {
    return await prisma.priorityLevel.create({
      data: {
        label: data.label,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : 0,
        status: data.status || "ACTIVE",
        createdById: adminUserId,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        "A priority level with this label already exists",
        400,
      );
    }
    throw error;
  }
};

const listPriorities = async ({ includeInactive = false }) => {
  const where = {};
  if (!includeInactive) {
    where.status = "ACTIVE";
  }

  return prisma.priorityLevel.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
};

const getPriorityById = async (id) => {
  const priority = await prisma.priorityLevel.findUnique({
    where: { id },
  });

  if (!priority) {
    throw new AppError("Priority level not found", 404);
  }

  return priority;
};

const updatePriority = async (id, data) => {
  const existing = await prisma.priorityLevel.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Priority level not found", 404);
  }

  if (data.label && data.label !== existing.label) {
    const duplicate = await prisma.priorityLevel.findUnique({
      where: { label: data.label },
    });
    if (duplicate && duplicate.id !== id) {
      throw new AppError(
        "A priority level with this label already exists",
        400,
      );
    }
  }

  try {
    return await prisma.priorityLevel.update({
      where: { id },
      data: {
        label: data.label !== undefined ? data.label : undefined,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        "A priority level with this label already exists",
        400,
      );
    }
    throw error;
  }
};

const retirePriority = async (id) => {
  const existing = await prisma.priorityLevel.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Priority level not found", 404);
  }

  return prisma.priorityLevel.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

module.exports = {
  createPriority,
  listPriorities,
  getPriorityById,
  updatePriority,
  retirePriority,
};
