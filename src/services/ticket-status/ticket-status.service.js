const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

/**
 * Ticket Status Service (Phase 5 Master Data Management)
 */

/**
 * Creates a new Ticket Status.
 * - Admin (GLOBAL scope on STATUS_CREATE): can create global (teamId: null) or team-specific for any team.
 * - User (TEAM scope on STATUS_CREATE): teamId is REQUIRED and must match an active UserTeam membership.
 * - Enforces behavior is valid TicketStatusBehavior.
 * - Enforces global vs team-scoped unique label indexes with friendly errors.
 */
const createTicketStatus = async (data, user, isGlobalScope = false) => {
  let targetTeamId = data.teamId ? Number(data.teamId) : null;

  if (!isGlobalScope) {
    // Non-admin (User) must specify teamId and be an active member of that team
    if (!targetTeamId) {
      throw new AppError(
        "Team ID is required to create a team-specific status",
        400,
      );
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

  // If teamId is specified (by Admin or User), verify team exists and is ACTIVE
  if (targetTeamId) {
    const team = await prisma.team.findUnique({
      where: { id: targetTeamId },
    });
    if (!team) {
      throw new AppError("Team not found", 404);
    }
    if (team.status !== "ACTIVE") {
      throw new AppError(
        "Cannot create ticket status for an inactive team",
        400,
      );
    }
  }

  // Pre-check for friendly duplicate error
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
    return await prisma.ticketStatus.create({
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
        team: {
          select: { id: true, name: true },
        },
      },
    });
  } catch (error) {
    // Catch partial unique index violations
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
 * Lists ticket statuses:
 * - If ?teamId=X is provided: returns active global statuses + active team-specific statuses for team X.
 * - If ?teamId is omitted: returns active global statuses (default dropdown consumption).
 * - If ?all=true or ?teamId=all: returns all statuses.
 * - If ?includeInactive=true: includes inactive statuses.
 * - Ordered by sortOrder ASC, id ASC.
 */
const listTicketStatuses = async ({
  teamId,
  includeInactive = false,
  all = false,
}) => {
  const where = {};

  if (!includeInactive) {
    where.status = "ACTIVE";
  }

  if (all || teamId === "all") {
    // No team scoping filter
  } else if (teamId !== undefined && teamId !== null && teamId !== "") {
    where.OR = [{ teamId: null }, { teamId: Number(teamId) }];
  } else {
    where.teamId = null;
  }

  return prisma.ticketStatus.findMany({
    where,
    include: {
      team: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
};

/**
 * Retrieves a single ticket status by ID.
 */
const getTicketStatusById = async (id) => {
  const status = await prisma.ticketStatus.findUnique({
    where: { id },
    include: {
      team: {
        select: { id: true, name: true },
      },
    },
  });

  if (!status) {
    throw new AppError("Ticket status not found", 404);
  }

  return status;
};

/**
 * Updates a ticket status.
 * Gated by STATUS_UPDATE (Admin / GLOBAL).
 * Allows updating: label, description, behavior, sortOrder, status.
 * Catches DB trigger fn_prevent_ticket_status_team_change if teamId change is attempted.
 */
const updateTicketStatus = async (id, data) => {
  const existing = await prisma.ticketStatus.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Ticket status not found", 404);
  }

  // Pre-check label duplicate if label is updated
  if (data.label && data.label !== existing.label) {
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
    return await prisma.ticketStatus.update({
      where: { id },
      data: {
        label: data.label !== undefined ? data.label : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        behavior: data.behavior !== undefined ? data.behavior : undefined,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
      include: {
        team: {
          select: { id: true, name: true },
        },
      },
    });
  } catch (error) {
    // Intercept partial unique index violations
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

    // Intercept trigger fn_prevent_ticket_status_team_change
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
 * Retires a ticket status (soft-delete: status = INACTIVE).
 * Gated by STATUS_RETIRE (Admin / GLOBAL).
 */
const retireTicketStatus = async (id) => {
  const existing = await prisma.ticketStatus.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError("Ticket status not found", 404);
  }

  return prisma.ticketStatus.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
};

module.exports = {
  createTicketStatus,
  listTicketStatuses,
  getTicketStatusById,
  updateTicketStatus,
  retireTicketStatus,
};
