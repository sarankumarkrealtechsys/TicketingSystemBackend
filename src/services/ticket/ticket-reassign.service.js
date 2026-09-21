const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Full Reassignment of a ticket (Admin only).
 * - Can reassign in ANY status, including CLOSED.
 * - Soft-removes all current assignees and establishes new assignees.
 * - Optionally changes primary teamId (soft-removing it from collaborating teams if present).
 * - Enforces assignee department match with target team.
 * - Records single REASSIGNED TicketHistory entry with previous & new state.
 */
const reassignTicket = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      team: { select: { id: true, name: true, departmentId: true } },
      status: { select: { id: true, behavior: true } },
      assignees: {
        where: { removedAt: null },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  let targetTeam = ticket.team;
  if (data.teamId && Number(data.teamId) !== ticket.teamId) {
    const newTeam = await prisma.team.findUnique({
      where: { id: Number(data.teamId) },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!newTeam) {
      throw new AppError("Target team not found", 404);
    }
    if (newTeam.status !== "ACTIVE") {
      throw new AppError("Cannot reassign ticket to an inactive team", 400);
    }
    targetTeam = newTeam;
  }

  if (!Array.isArray(data.assigneeIds) || data.assigneeIds.length === 0) {
    throw new AppError(
      "At least one assignee is required for reassignment",
      400,
    );
  }

  if (data.assigneeIds.length !== new Set(data.assigneeIds.map(Number)).size) {
    throw new AppError("Duplicate assignee IDs provided in request", 400);
  }

  const uniqueAssigneeIds = [...new Set(data.assigneeIds.map(Number))];

  // Prevent redundant reassignment to identical team and assignee set
  const currentActiveAssigneeIds = ticket.assignees.map((a) => a.userId).sort((a, b) => a - b);
  const targetAssigneeIds = [...uniqueAssigneeIds].sort((a, b) => a - b);
  const isSameTeam = (!data.teamId || Number(data.teamId) === ticket.teamId);
  const isSameAssignees =
    currentActiveAssigneeIds.length === targetAssigneeIds.length &&
    currentActiveAssigneeIds.every((id, idx) => id === targetAssigneeIds[idx]);

  if (isSameTeam && isSameAssignees) {
    throw new AppError("Ticket is already assigned to this team and assignee set", 400);
  }

  const newAssignees = await prisma.user.findMany({
    where: {
      id: { in: uniqueAssigneeIds },
      status: "ACTIVE",
    },
    select: { id: true, name: true, departmentId: true },
  });

  if (newAssignees.length !== uniqueAssigneeIds.length) {
    throw new AppError(
      "One or more assignees are invalid, duplicate, or inactive",
      400,
    );
  }

  for (const a of newAssignees) {
    if (a.departmentId !== targetTeam.departmentId) {
      throw new AppError(
        `Cannot assign user "${a.name}" (id=${a.id}) — assignee must belong to the same department as the team`,
        400,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Soft-remove all currently active assignees
      await tx.ticketAssignee.updateMany({
        where: {
          ticketId: ticket.id,
          removedAt: null,
        },
        data: {
          removedAt: new Date(),
        },
      });

      // 2. Update primary team FIRST if changed (so trigger recognizes targetTeam as primary team)
      const teamChanged = targetTeam.id !== ticket.teamId;
      if (teamChanged) {
        // Soft-remove targetTeam from collaborating teams BEFORE updating primary team
        // (so trigger enforce_ticket_team_not_primary sees targetTeam is not primary during the update)
        const removedCollab = await tx.ticketTeam.updateMany({
          where: {
            ticketId: ticket.id,
            teamId: targetTeam.id,
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
          },
        });

        if (removedCollab.count > 0) {
          await tx.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              action: "TEAM_REMOVED",
              previousTeamId: targetTeam.id,
              previousValue: JSON.stringify({
                teamId: targetTeam.id,
                name: targetTeam.name,
                reason: "Promoted to primary team via reassignment",
              }),
              updatedById: user.id,
            },
          });
        }

        // Now update ticket's primary team to targetTeam.id
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { teamId: targetTeam.id },
        });
      }

      // 3. Reactivate or create new assignees under targetTeam.id
      for (const assigneeId of uniqueAssigneeIds) {
        const existing = await tx.ticketAssignee.findFirst({
          where: {
            ticketId: ticket.id,
            userId: assigneeId,
          },
        });

        if (existing) {
          await tx.ticketAssignee.update({
            where: { id: existing.id },
            data: {
              teamId: targetTeam.id,
              removedAt: null,
              assignedAt: new Date(),
              assignedById: user.id,
            },
          });
        } else {
          await tx.ticketAssignee.create({
            data: {
              ticketId: ticket.id,
              userId: assigneeId,
              teamId: targetTeam.id,
              assignedById: user.id,
            },
          });
        }
      }

      // 4. If ticket was CLOSED, automatically transition back to active OPEN status
      const wasClosed = ticket.status.behavior === "CLOSED";
      if (wasClosed) {
        let openStatus = await tx.ticketStatus.findFirst({
          where: {
            behavior: "OPEN",
            status: "ACTIVE",
            teamId: targetTeam.id,
          },
          orderBy: { sortOrder: "asc" },
        });

        if (!openStatus) {
          openStatus = await tx.ticketStatus.findFirst({
            where: {
              behavior: "OPEN",
              status: "ACTIVE",
              teamId: null,
            },
            orderBy: { sortOrder: "asc" },
          });
        }

        if (openStatus) {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              statusId: openStatus.id,
            },
          });

          await tx.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              action: "STATUS_CHANGED",
              previousStatusId: ticket.statusId,
              newStatusId: openStatus.id,
              previousBehavior: "CLOSED",
              newBehavior: "OPEN",
              remarks: "Reopened to Open status upon reassignment",
              updatedById: user.id,
            },
          });
        }
      }

      // 5. Record single REASSIGNED entry in TicketHistory
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "REASSIGNED",
          previousTeamId: teamChanged ? ticket.teamId : null,
          newTeamId: teamChanged ? targetTeam.id : null,
          remarks: data.remarks || null,
          previousValue: JSON.stringify({
            teamId: ticket.teamId,
            teamName: ticket.team.name,
            assignees: ticket.assignees.map((a) => ({
              userId: a.userId,
              name: a.user.name,
            })),
          }),
          newValue: JSON.stringify({
            teamId: targetTeam.id,
            teamName: targetTeam.name,
            assignees: newAssignees.map((a) => ({
              userId: a.id,
              name: a.name,
            })),
            wasClosed,
          }),
          updatedById: user.id,
        },
      });

      // 6. Return updated ticket
      return tx.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
          assignees: {
            where: { removedAt: null },
            select: {
              id: true,
              userId: true,
              assignedAt: true,
              teamId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                  departmentId: true,
                },
              },
            },
          },
          collaboratingTeams: {
            where: { removedAt: null },
            include: {
              team: {
                select: { id: true, name: true, departmentId: true },
              },
            },
          },
        },
      });
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  reassignTicket,
};
