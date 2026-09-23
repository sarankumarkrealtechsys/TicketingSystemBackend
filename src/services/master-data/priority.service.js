const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Updates a priority level.
 * If label is changed (RENAMED), records an AuditLog inside the transaction.
 */
const updatePriority = async (id, body, user) => {
  const { label, sortOrder, status } = body;

  const existing = await prisma.priorityLevel.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Priority level not found", 404);
  }

  const isRenamed = label !== undefined && label !== existing.label;

  if (isRenamed) {
    const duplicate = await prisma.priorityLevel.findUnique({ where: { label } });
    if (duplicate && duplicate.id !== id) {
      throw new AppError("A priority level with this label already exists", 400);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const data = await tx.priorityLevel.update({
        where: { id },
        data: {
          label: label !== undefined ? label : undefined,
          sortOrder: sortOrder !== undefined ? sortOrder : undefined,
          status: status !== undefined ? status : undefined,
        },
      });

      if (isRenamed) {
        await tx.auditLog.create({
          data: {
            entityType: "PriorityLevel",
            entityId: id,
            action: "RENAMED",
            previousValue: JSON.stringify({ label: existing.label }),
            newValue: JSON.stringify({ label: data.label }),
            performedById: user.id,
          },
        });
      }

      return data;
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("A priority level with this label already exists", 400);
    }
    throw error;
  }
};

/**
 * Retires a priority level (sets status to INACTIVE).
 * Records an AuditLog (RETIRED) inside the transaction.
 */
const retirePriority = async (id, user) => {
  const existing = await prisma.priorityLevel.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Priority level not found", 404);
  }

  return await prisma.$transaction(async (tx) => {
    const data = await tx.priorityLevel.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await tx.auditLog.create({
      data: {
        entityType: "PriorityLevel",
        entityId: id,
        action: "RETIRED",
        previousValue: JSON.stringify({ status: existing.status }),
        newValue: JSON.stringify({ status: "INACTIVE" }),
        performedById: user.id,
      },
    });

    return data;
  });
};

/**
 * Permanently deletes an archived priority level.
 * Requires the priority to be INACTIVE and assigned to 0 tickets.
 * Records AuditLog (DELETED) inside the transaction.
 */
const deletePriorityPermanently = async (id, user) => {
  const existing = await prisma.priorityLevel.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Priority level not found", 404);
  }

  if (existing.status !== "INACTIVE") {
    throw new AppError(
      `Only archived priority levels can be permanently deleted. Please archive "${existing.label}" first.`,
      400
    );
  }

  const ticketCount = await prisma.ticket.count({ where: { priorityId: id } });
  if (ticketCount > 0) {
    throw new AppError(
      `Cannot delete priority "${existing.label}" because ${ticketCount} ticket(s) are currently assigned to it. Reassign those tickets before deleting, or keep it archived.`,
      400
    );
  }

  return await prisma.$transaction(async (tx) => {
    const deleted = await tx.priorityLevel.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        entityType: "PriorityLevel",
        entityId: id,
        action: "DELETED",
        previousValue: JSON.stringify({
          label: existing.label,
          sortOrder: existing.sortOrder,
          status: existing.status,
        }),
        performedById: user.id,
      },
    });

    return deleted;
  });
};

module.exports = {
  updatePriority,
  retirePriority,
  deletePriorityPermanently,
};
