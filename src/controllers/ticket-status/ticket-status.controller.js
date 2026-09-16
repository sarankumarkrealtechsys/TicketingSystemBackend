const ticketStatusService = require("../../services/ticket-status/ticket-status.service");
const { getPermissions } = require("../../services/auth/permission.service");

const createTicketStatus = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["STATUS_CREATE"]?.includes("GLOBAL");

    const data = await ticketStatusService.createTicketStatus(
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

const listTicketStatuses = async (req, res, next) => {
  try {
    const data = await ticketStatusService.listTicketStatuses({
      teamId: req.query.teamId,
      includeInactive:
        req.query.includeInactive === "true" ||
        req.query.includeInactive === true,
      all: req.query.all === "true",
    });
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getTicketStatusById = async (req, res, next) => {
  try {
    const data = await ticketStatusService.getTicketStatusById(
      Number(req.params.id),
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updateTicketStatus = async (req, res, next) => {
  try {
    const data = await ticketStatusService.updateTicketStatus(
      Number(req.params.id),
      req.body,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const retireTicketStatus = async (req, res, next) => {
  try {
    const data = await ticketStatusService.retireTicketStatus(
      Number(req.params.id),
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
  createTicketStatus,
  listTicketStatuses,
  getTicketStatusById,
  updateTicketStatus,
  retireTicketStatus,
};
