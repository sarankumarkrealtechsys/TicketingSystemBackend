const ticketHistoryService = require("../../services/ticket/ticket-history.service");

/**
 * GET /api/tickets/:id/history
 * Retrieves full audit history for a single ticket.
 * Scoped by TICKET_HISTORY_VIEW (Admin: GLOBAL, User: OWN + ASSIGNED).
 */
const getTicketHistory = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const data = await ticketHistoryService.getTicketHistory({
      ticketId,
      query: req.query,
    });

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTicketHistory,
};
