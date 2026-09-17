const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Adds a collaborating team to a ticket (Admin only).
 * - Enforces that collaborating team is not the ticket's primary team.
 * - Enforces that collaborating team is active and in the same department as the primary team.
 * - Enforces partial unique constraint: cannot duplicate active collaborating team.
 * - Records TEAM_ADDED in TicketHistory.
 */
const addCollaboratingTeam = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      status: { select: { behavior: true } },
      team: { select: { id: true, name: true, departmentId: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot add collaborating team to a closed ticket", 400);
  }

  const targetTeamId = Number(data.teamId);

  if (targetTeamId === ticket.teamId) {
    throw new AppError(
      "Cannot add ticket's primary team as a collaborating team",
      400,
    );
  }

  const collabTeam = await prisma.team.findUnique({
    where: { id: targetTeamId },
    select: { id: true, name: true, status: true, departmentId: true },
  });

  if (!collabTeam) {
    throw new AppError("Team not found", 404);
  }
  if (collabTeam.status !== "ACTIVE") {
    throw new AppError("Cannot add an inactive team as collaborating team", 400);
  }
  if (collabTeam.departmentId !== ticket.team.departmentId) {
    throw new AppError(
      "Collaborating team must belong to the same department as the ticket's primary team",
      400,
    );
  }

  const activeTeam = await prisma.ticketTeam.findFirst({
    where: {
      ticketId: ticket.id,
      teamId: targetTeamId,
      removedAt: null,
    },
  });

  if (activeTeam) {
    throw new AppError(
      "Team is already an active collaborating team on this ticket",
      400,
    );
  }

  const existingTeam = await prisma.ticketTeam.findFirst({
    where: {
      ticketId: ticket.id,
      teamId: targetTeamId,
    },
    orderBy: { id: "desc" },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      let teamRecord;
      if (existingTeam) {
        teamRecord = await tx.ticketTeam.update({
          where: { id: existingTeam.id },
          data: {
            removedAt: null,
            assignedAt: new Date(),
            assignedById: user.id,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true },
            },
          },
        });
      } else {
        teamRecord = await tx.ticketTeam.create({
          data: {
            ticketId: ticket.id,
            teamId: targetTeamId,
            assignedById: user.id,
          },
          include: {
            team: {
              select: { id: true, name: true, departmentId: true },
            },
          },
        });
      }

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "TEAM_ADDED",
          newTeamId: targetTeamId,
          newValue: JSON.stringify({
            teamId: targetTeamId,
            name: collabTeam.name,
          }),
          updatedById: user.id,
        },
      });

      return teamRecord;
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

/**
 * Removes a collaborating team from a ticket (soft removal, Admin only).
 * - Records TEAM_REMOVED in TicketHistory.
 */
const removeCollaboratingTeam = async (ticketId, targetTeamId, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      status: { select: { behavior: true } },
      collaboratingTeams: {
        where: { removedAt: null },
        include: {
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot remove collaborating team from a closed ticket", 400);
  }

  const collabTeam = ticket.collaboratingTeams.find(
    (ct) => ct.teamId === Number(targetTeamId),
  );

  if (!collabTeam) {
    throw new AppError(
      "Team is not an active collaborating team on this ticket",
      404,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.ticketTeam.update({
        where: { id: collabTeam.id },
        data: {
          removedAt: new Date(),
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "TEAM_REMOVED",
          previousTeamId: collabTeam.teamId,
          previousValue: JSON.stringify({
            teamId: collabTeam.teamId,
            name: collabTeam.team.name,
          }),
          updatedById: user.id,
        },
      });

      return {
        message: "Collaborating team removed successfully",
        teamId: collabTeam.teamId,
      };
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  addCollaboratingTeam,
  removeCollaboratingTeam,
};
