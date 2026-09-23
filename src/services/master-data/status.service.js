const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Creates a new ticket status.
 * Records AuditLog (CREATED) inside the transaction.
 */
const createStatus = async (data, user, isGlobalScope) => {
  let targetTeamId = data.teamId ? Number(data.teamId) : null;

  if (!isGlobalScope) {
    if (!targetTeamId) {
      throw new AppError("Team ID is required to create a team-specific status", 400);
    }

    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: user.id,
        teamId: targetTeamId,
        removedAt: null,
      },
    });

    if (!membership) {
      throw new AppError(
        "You can only create ticket statuses for teams you are an active member of",
        403,
      );
    }
  }

  if (targetTeamId) {
    const team = await prisma.team.findUnique({ where: { id: targetTeamId } });
    if (!team) {
      throw new AppError("Team not found", 404);
    }
    if (team.status !== "ACTIVE") {
      throw new AppError("Cannot create ticket status for an inactive team", 400);
    }
  }

  const existing = await prisma.ticketStatus.findFirst({
    where: {
      label: data.label,
      teamId: targetTeamId,
    },
  });
  if (existing) {
    throw new AppError(
      targetTeamId
        ? "A status with this label already exists for this team"
        : "A status with this label already exists globally",
      400,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.ticketStatus.create({
        data: {
          label: data.label,
          description: data.description || null,
          behavior: data.behavior,
          teamId: targetTeamId,
          sortOrder: data.sortOrder !== undefined ? data.sortOrder : 0,
          status: data.status || "ACTIVE",
          createdById: user.id,
        },
        include: {
          team: { select: { id: true, name: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "TicketStatus",
          entityId: created.id,
          action: "CREATED",
          newValue: JSON.stringify({
            label: created.label,
            behavior: created.behavior,
            teamId: created.teamId,
          }),
          performedById: user.id,
        },
      });

      return created;
    });
  } catch (error) {
    if (
      error.code === "P2002" ||
      error.message?.includes("uq_ticket_status_global_label") ||
      error.message?.includes("uq_ticket_status_team_label")
    ) {
      throw new AppError(
        targetTeamId
          ? "A status with this label already exists for this team"
          : "A status with this label already exists globally",
        400,
      );
    }
    throw error;
  }
};

/**
 * Updates an existing ticket status.
 * If label is changed (RENAMED), records an AuditLog inside the transaction.
 */
const updateStatus = async (id, data, user) => {
  const existing = await prisma.ticketStatus.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Ticket status not found", 404);
  }

  const isRenamed = data.label !== undefined && data.label !== existing.label;

  if (isRenamed) {
    const duplicate = await prisma.ticketStatus.findFirst({
      where: {
        label: data.label,
        teamId: existing.teamId,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new AppError(
        existing.teamId
          ? "A status with this label already exists for this team"
          : "A status with this label already exists globally",
        400,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ticketStatus.update({
        where: { id },
        data: {
          label: data.label !== undefined ? data.label : undefined,
          description: data.description !== undefined ? data.description : undefined,
          behavior: data.behavior !== undefined ? data.behavior : undefined,
          sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
          status: data.status !== undefined ? data.status : undefined,
        },
        include: {
          team: { select: { id: true, name: true } },
        },
      });

      if (isRenamed) {
        await tx.auditLog.create({
          data: {
            entityType: "TicketStatus",
            entityId: id,
            action: "RENAMED",
            previousValue: JSON.stringify({ label: existing.label }),
            newValue: JSON.stringify({ label: updated.label }),
            performedById: user.id,
          },
        });
      }

      return updated;
    });
  } catch (error) {
    if (
      error.code === "P2002" ||
      error.message?.includes("uq_ticket_status_global_label") ||
      error.message?.includes("uq_ticket_status_team_label")
    ) {
      throw new AppError(
        existing.teamId
          ? "A status with this label already exists for this team"
          : "A status with this label already exists globally",
        400,
      );
    }

    if (
      error.message?.includes("Cannot change team for ticket status") ||
      error.message?.includes("prevent_ticket_status_team_change") ||
      error.message?.includes("fn_prevent_ticket_status_team_change")
    ) {
      throw new AppError(
        "Cannot change team for ticket status — it is already referenced by existing tickets",
        400,
      );
    }

    throw error;
  }
};

/**
 * Retires an existing ticket status (status: INACTIVE).
 * Records AuditLog (RETIRED) inside the transaction.
 */
const retireStatus = async (id, user) => {
  const existing = await prisma.ticketStatus.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Ticket status not found", 404);
  }

  return await prisma.$transaction(async (tx) => {
    const data = await tx.ticketStatus.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await tx.auditLog.create({
      data: {
        entityType: "TicketStatus",
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
 * Permanently deletes an archived ticket status.
 * Requires the status to be non-default, INACTIVE, and assigned to 0 tickets.
 * Records AuditLog (DELETED) inside the transaction.
 */
const deleteStatusPermanently = async (id, user) => {
  const existing = await prisma.ticketStatus.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Ticket status not found", 404);
  }

  if (existing.isDefault) {
    throw new AppError("System default statuses cannot be deleted", 400);
  }

  if (existing.status !== "INACTIVE") {
    throw new AppError(
      `Only archived workflow statuses can be permanently deleted. Please archive "${existing.label}" first.`,
      400
    );
  }

  const ticketCount = await prisma.ticket.count({ where: { statusId: id } });
  if (ticketCount > 0) {
    throw new AppError(
      `Cannot delete status "${existing.label}" because ${ticketCount} ticket(s) are currently in this status. Reassign those tickets before deleting, or keep it archived.`,
      400
    );
  }

  return await prisma.$transaction(async (tx) => {
    const deleted = await tx.ticketStatus.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        entityType: "TicketStatus",
        entityId: id,
        action: "DELETED",
        previousValue: JSON.stringify({
          label: existing.label,
          behavior: existing.behavior,
          teamId: existing.teamId,
          status: existing.status,
        }),
        performedById: user.id,
      },
    });

    return deleted;
  });
};

module.exports = {
  createStatus,
  updateStatus,
  retireStatus,
  deleteStatusPermanently,
};
