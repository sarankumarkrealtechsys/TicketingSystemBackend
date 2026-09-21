const ticketCreateService = require("../../services/ticket/ticket-create.service");
const ticketUpdateService = require("../../services/ticket/ticket-update.service");
const ticketQueryService = require("../../services/ticket/ticket-query.service");
const ticketAssigneeService = require("../../services/ticket/ticket-assignee.service");
const ticketReassignService = require("../../services/ticket/ticket-reassign.service");
const ticketTeamService = require("../../services/ticket/ticket-team.service");
const ticketLifecycleService = require("../../services/ticket/ticket-lifecycle.service");
const ticketRemarkService = require("../../services/ticket/ticket-remark.service");
const notificationService = require("../../services/notification/notification.service");
const { getPermissions } = require("../../services/auth/permission.service");
const { getOrSetCache, invalidateCachePattern } = require("../../utils/cache");

const createTicket = async (req, res, next) => {
  try {
    // req.isGlobalScope is set by requirePermission("TICKET_CREATE") middleware
    const data = await ticketCreateService.createTicket(
      req.body,
      req.user,
      req.isGlobalScope,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyTicketCreated(data, req.user);

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

    const data = await ticketQueryService.listTickets({
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

    const data = await ticketQueryService.getTicketById(
      Number(req.params.id),
      req.user,
      isGlobalScope,
      userPermissions,
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
    // Prevent browser and intermediary HTTP caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = Boolean(userPermissions["TICKET_VIEW"]?.includes("GLOBAL"));
    // Non-global callers are strictly restricted to personal scope
    const scope = !isGlobalScope ? "personal" : (req.query.scope || "global");

    // Strictly scope cache key by user role, user ID, and scope so responses are never shared
    const cacheKey = `ticket-stats:${req.user.userRole?.name || "USER"}:${req.user.id}:${scope}`;

    const data = await getOrSetCache(cacheKey, 60, () =>
      ticketQueryService.getTicketStats(
        req.user,
        isGlobalScope && scope !== "personal",
        scope,
      ),
    );

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
    const data = await ticketAssigneeService.addTicketAssignee(
      Number(req.params.id),
      req.body,
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyAssigneeAdded(
      Number(req.params.id),
      data.user || data,
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
    const data = await ticketAssigneeService.removeTicketAssignee(
      Number(req.params.id),
      Number(req.params.userId),
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    if (data.removedUser) {
      notificationService.notifyAssigneeRemoved(
        Number(req.params.id),
        data.removedUser,
        req.user,
      );
    }

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
    const data = await ticketReassignService.reassignTicket(
      Number(req.params.id),
      req.body,
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyTicketReassigned(
      Number(req.params.id),
      data,
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
    const data = await ticketTeamService.addCollaboratingTeam(
      Number(req.params.id),
      req.body,
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyCollaboratingTeamAdded(
      Number(req.params.id),
      data.teamId,
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
    const data = await ticketTeamService.removeCollaboratingTeam(
      Number(req.params.id),
      Number(req.params.teamId),
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyCollaboratingTeamRemoved(
      Number(req.params.id),
      Number(req.params.teamId),
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
    const data = await ticketLifecycleService.changeTicketStatus(
      Number(req.params.id),
      req.body,
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyStatusChanged(
      data,
      {
        previousStatusLabel: data._previousStatus?.label,
        newStatusLabel: data.status?.label,
        remarks: req.body.remarks,
      },
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

    const data = await ticketLifecycleService.closeTicket(
      Number(req.params.id),
      req.body,
      req.user,
      isGlobalScope,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyStatusChanged(
      data,
      {
        previousStatusLabel: data._previousStatus?.label,
        newStatusLabel: data.status?.label,
        remarks: req.body.remarks || "Ticket closed",
      },
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

const changePriority = async (req, res, next) => {
  try {
    const data = await ticketLifecycleService.changeTicketPriority(
      Number(req.params.id),
      req.body,
      req.user,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifyPriorityChanged(
      data,
      {
        previousPriorityLabel: data._previousPriority?.label,
        newPriorityLabel: data.priority?.label,
        remarks: req.body.remarks,
      },
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

    const data = await ticketCreateService.createTicket(
      { ...req.body, parentTicketId: Number(req.params.id) },
      req.user,
      isGlobalScope,
    );

    await invalidateCachePattern("ticket-stats:*");

    notificationService.notifySubTicketCreated(
      data,
      Number(req.params.id),
      req.user,
    );

    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const addRemark = async (req, res, next) => {
  try {
    const data = await ticketRemarkService.addTicketRemark(
      Number(req.params.id),
      req.body,
      req.user,
    );

    notificationService.notifyNewRemark(Number(req.params.id), data, req.user);

    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updateTicket = async (req, res, next) => {
  try {
    const userPermissions = await getPermissions(req.user, req);
    const isGlobalScope = userPermissions["TICKET_UPDATE"]?.includes("GLOBAL");

    const data = await ticketUpdateService.updateTicket(
      Number(req.params.id),
      req.body,
      req.user,
      isGlobalScope,
    );

    await invalidateCachePattern("ticket-stats:*");

    return res.status(200).json({
      status: "success",
      message: "Ticket updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getAgingReport = async (req, res, next) => {
  try {
    const isGlobalScope = req.permissionScope === "GLOBAL";
    const data = await ticketQueryService.getAgingReport({
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

module.exports = {
  createTicket,
  updateTicket,
  listTickets,
  getTicketById,
  getTicketStats,
  getAgingReport,
  addAssignee,
  removeAssignee,
  reassignTicket,
  addCollaboratingTeam,
  removeCollaboratingTeam,
  changeStatus,
  closeTicket,
  changePriority,
  createSubTicket,
  addRemark,
};
