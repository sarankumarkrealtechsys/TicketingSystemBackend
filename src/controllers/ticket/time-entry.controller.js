const timeEntryService = require("../../services/ticket/time-entry.service");

/**
 * POST /api/tickets/:id/time-entries
 * Logs time spent on a ticket.
 * Standard user must be an active assignee on the ticket.
 */
const logTime = async (req, res, next) => {
  try {
    const isGlobalScope = Boolean(req.isGlobalScope);

    const data = await timeEntryService.logTime(
      req.params.id,
      req.body,
      req.user,
      isGlobalScope,
    );

    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tickets/:id/time-entries/summary
 * Computes aggregated time summary for a ticket.
 * Standard user receives only their own time summary.
 * Admin GLOBAL receives complete ticket summary.
 */
const getTicketTimeSummary = async (req, res, next) => {
  try {
    const isGlobalScope = Boolean(req.isGlobalScope);

    const data = await timeEntryService.getTicketTimeSummary(
      req.params.id,
      req.query,
      req.user,
      isGlobalScope,
    );

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tickets/:id/time-entries
 * Lists individual time entries for a ticket with pagination and filters.
 * Standard user receives only their own time entries.
 * Admin GLOBAL receives complete ticket time entries.
 */
const listTicketTimeEntries = async (req, res, next) => {
  try {
    const isGlobalScope = Boolean(req.isGlobalScope);

    const data = await timeEntryService.listTicketTimeEntries(
      req.params.id,
      req.query,
      req.user,
      isGlobalScope,
    );

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/time-entries/user-summary
 * Computes aggregated time summary for the authenticated user.
 * Target user is always strictly req.user.id.
 */
const getUserTimeSummary = async (req, res, next) => {
  try {
    const data = await timeEntryService.getUserTimeSummary(
      req.user.id,
      req.query,
    );

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logTime,
  getTicketTimeSummary,
  listTicketTimeEntries,
  getUserTimeSummary,
};
