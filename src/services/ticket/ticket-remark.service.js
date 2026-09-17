const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { handleTicketDbErrors } = require("./ticket-common.service");

/**
 * Adds a remark/comment to an existing ticket.
 * - Gated by TICKET_ADD_REMARK (Admin GLOBAL, User ASSIGNED).
 * - Records REMARK_ADDED in TicketHistory.
 */
const addTicketRemark = async (ticketId, data, user) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    select: {
      id: true,
      ticketNumber: true,
      status: { select: { behavior: true } },
    },
  });

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.status?.behavior === "CLOSED") {
    throw new AppError("Cannot add remarks to a closed ticket", 400);
  }

  const trimmedRemarks = data.remarks?.trim();
  if (!trimmedRemarks) {
    throw new AppError("Remarks cannot be empty", 400);
  }

  // Prevent duplicate consecutive remarks by the same user within 30 seconds
  const lastRemark = await prisma.ticketHistory.findFirst({
    where: {
      ticketId: ticket.id,
      action: "REMARK_ADDED",
      updatedById: user.id,
    },
    orderBy: { updatedAt: "desc" },
    select: { remarks: true, updatedAt: true },
  });

  if (lastRemark && lastRemark.remarks?.trim() === trimmedRemarks) {
    const diffMs = Date.now() - new Date(lastRemark.updatedAt).getTime();
    if (diffMs < 30000) {
      throw new AppError(
        "Duplicate remark detected. Please wait before posting the same remark again.",
        400,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const historyEntry = await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          action: "REMARK_ADDED",
          remarks: trimmedRemarks,
          updatedById: user.id,
        },
        include: {
          updatedBy: {
            select: { id: true, name: true, username: true, email: true },
          },
        },
      });

      return {
        id: historyEntry.id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        action: historyEntry.action,
        remarks: historyEntry.remarks,
        createdAt: historyEntry.updatedAt,
        author: historyEntry.updatedBy,
      };
    });
  } catch (error) {
    handleTicketDbErrors(error);
  }
};

module.exports = {
  addTicketRemark,
};
