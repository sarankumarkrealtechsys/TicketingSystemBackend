const ticketService = require("../../services/ticket/ticket.service");
const { getPermissions } = require("../../services/auth/permission.service");

const createTicket = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_CREATE"]?.includes("GLOBAL");

    const data = await ticketService.createTicket(
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

const listTickets = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_VIEW"]?.includes("GLOBAL");

    const data = await ticketService.listTickets({
      query: req.query,
      user: req.user,
      isGlobalScope,
    });
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getTicketById = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_VIEW"]?.includes("GLOBAL");

    const data = await ticketService.getTicketById(
      Number(req.params.id),
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

const getTicketStats = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_VIEW"]?.includes("GLOBAL");

    const data = await ticketService.getTicketStats(req.user, isGlobalScope);
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const addAssignee = async (req, res, next) => {
  try {
    const data = await ticketService.addTicketAssignee(
      Number(req.params.id),
      req.body,
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const removeAssignee = async (req, res, next) => {
  try {
    const data = await ticketService.removeTicketAssignee(
      Number(req.params.id),
      Number(req.params.userId),
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const reassignTicket = async (req, res, next) => {
  try {
    const data = await ticketService.reassignTicket(
      Number(req.params.id),
      req.body,
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const addCollaboratingTeam = async (req, res, next) => {
  try {
    const data = await ticketService.addCollaboratingTeam(
      Number(req.params.id),
      req.body,
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const removeCollaboratingTeam = async (req, res, next) => {
  try {
    const data = await ticketService.removeCollaboratingTeam(
      Number(req.params.id),
      Number(req.params.teamId),
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const changeStatus = async (req, res, next) => {
  try {
    const data = await ticketService.changeTicketStatus(
      Number(req.params.id),
      req.body,
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const closeTicket = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_CLOSE"]?.includes("GLOBAL");

    const data = await ticketService.closeTicket(
      Number(req.params.id),
      req.body,
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

const changePriority = async (req, res, next) => {
  try {
    const data = await ticketService.changeTicketPriority(
      Number(req.params.id),
      req.body,
      req.user,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const createSubTicket = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_CREATE"]?.includes("GLOBAL");

    const data = await ticketService.createTicket(
      { ...req.body, parentTicketId: Number(req.params.id) },
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

module.exports = {
  createTicket,
  listTickets,
  getTicketById,
  getTicketStats,
  addAssignee,
  removeAssignee,
  reassignTicket,
  addCollaboratingTeam,
  removeCollaboratingTeam,
  changeStatus,
  closeTicket,
  changePriority,
  createSubTicket,
};
