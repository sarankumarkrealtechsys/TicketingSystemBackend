const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");
const { invalidateCachePattern } = require("../../utils/cache");
const recipientService = require("../notification/recipient.service");
const notificationService = require("../notification/notification.service");

/**
 * Permanently deletes a ticket and cleans up all associated relations in a transaction.
 *
 * Authorization:
 * - Admin (GLOBAL scope): can delete any ticket.
 * - Ticket Creator (OWN scope): can delete their own ticket.
 * - Other users / assignees without GLOBAL or OWN scope: blocked with 403.
 *
 * @param {number} ticketId - ID of ticket to delete
 * @param {Object} user - Authenticated user object (req.user)
 * @param {boolean} isGlobalScope - Whether caller holds GLOBAL scope for ticket management
 * @returns {Promise<Object>} Result object with deleted ticket details and confirmation message
 */
const deleteTicket = async (ticketId, user, isGlobalScope = false) => {
  const numericId = Number(ticketId);
  if (!numericId) {
    throw new AppError("Invalid ticket ID", 400);
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: numericId },
    select: {
      id: true,
      ticketNumber: true,
      summary: true,
      projectId: true,
      teamId: true,
      createdById: true,
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  // Enforce creator or Admin authorization
  const isCreator = Number(ticket.createdById) === Number(user.id);
  if (!isGlobalScope && !isCreator) {
    throw new AppError(
      "Forbidden: You do not have permission to delete this ticket",
      403,
    );
  }

  // Fetch full notification context prior to deletion so emails contain all ticket info
  let ticketContext = null;
  try {
    ticketContext = await recipientService.fetchTicketNotificationContext(numericId);
  } catch (ctxErr) {
    // Continue deletion even if context fetch fails
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete ticket history records (has RESTRICT foreign key)
      await tx.ticketHistory.deleteMany({
        where: { ticketId: numericId },
      });

      // 2. Delete time entries logged against the ticket
      await tx.timeEntry.deleteMany({
        where: { ticketId: numericId },
      });

      // 3. Delete attachments associated with the ticket
      await tx.ticketAttachment.deleteMany({
        where: { ticketId: numericId },
      });

      // 4. Delete custom field values
      await tx.ticketFieldValue.deleteMany({
        where: { ticketId: numericId },
      });

      // 5. Delete ticket assignees
      await tx.ticketAssignee.deleteMany({
        where: { ticketId: numericId },
      });

      // 6. Delete collaborating teams
      await tx.ticketTeam.deleteMany({
        where: { ticketId: numericId },
      });

      // 7. Detach any child sub-tickets so they don't break foreign key constraint
      await tx.ticket.updateMany({
        where: { parentTicketId: numericId },
        data: { parentTicketId: null },
      });

      // 8. Delete the ticket record itself
      await tx.ticket.delete({
        where: { id: numericId },
      });

      // 9. Record deletion in global AuditLog
      await tx.auditLog.create({
        data: {
          entityType: "TICKET",
          entityId: numericId,
          action: "DELETED",
          previousValue: JSON.stringify({
            ticketNumber: ticket.ticketNumber,
            summary: ticket.summary,
            projectId: ticket.projectId,
            teamId: ticket.teamId,
            createdById: ticket.createdById,
          }),
          newValue: null,
          performedById: user.id,
        },
      });
    });

    // Invalidate stats cache so KPI metrics immediately reflect the deletion
    await invalidateCachePattern("ticket-stats:*");

    // Asynchronously dispatch ticket deleted notification
    if (ticketContext) {
      notificationService.notifyTicketDeleted(ticketContext, user);
    }

    return {
      success: true,
      ticketId: numericId,
      ticketNumber: ticket.ticketNumber,
      message: `Ticket #${ticket.ticketNumber} deleted successfully`,
    };
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  deleteTicket,
};
