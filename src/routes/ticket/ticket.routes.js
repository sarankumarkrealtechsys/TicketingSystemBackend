const { Router } = require("express");
const { prisma } = require("../../lib/prisma");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  createTicketSchema,
  ticketQuerySchema,
  ticketIdParamSchema,
  addAssigneeSchema,
  removeAssigneeSchema,
  reassignTicketSchema,
  addCollaboratingTeamSchema,
  removeCollaboratingTeamSchema,
  changeStatusSchema,
  closeTicketSchema,
  changePrioritySchema,
  createSubTicketSchema,
} = require("../../validators/ticket/ticket.validator");
const ticketController = require("../../controllers/ticket/ticket.controller");

const router = Router();

/**
 * Scope resolver for TICKET_ASSIGN when caller holds OWN scope.
 * Admin (GLOBAL) skips this via rbac middleware short-circuit.
 * Standard user (OWN) is verified against ticket.createdById === user.id.
 */
const resolveTicketCreator = async (user, _resource, req) => {
  const ticketId = Number(req.params.id);
  if (!ticketId) return false;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { createdById: true },
  });
  if (!ticket) return false;
  return ticket.createdById === user.id;
};

/**
 * Scope resolver for TICKET_CHANGE_STATUS, TICKET_CHANGE_PRIORITY, and TICKET_CLOSE
 * when caller holds ASSIGNED scope.
 * Admin (GLOBAL) skips this via rbac middleware short-circuit.
 * Standard user (ASSIGNED) must have an active TicketAssignee row on the ticket.
 */
const resolveTicketAssignee = async (user, _resource, req) => {
  const ticketId = Number(req.params.id);
  if (!ticketId) return false;
  const activeAssignment = await prisma.ticketAssignee.findFirst({
    where: {
      ticketId,
      userId: user.id,
      removedAt: null,
    },
  });
  return !!activeAssignment;
};

/**
 * Scope resolver for TICKET_CREATE_SUBTICKET (OWN + ASSIGNED on parent ticket).
 * Admin (GLOBAL) skips this via rbac middleware short-circuit.
 * Standard user must be the parent ticket creator (OWN) or an active assignee on the parent (ASSIGNED).
 */
const resolveParentTicketCreatorOrAssignee = async (user, _resource, req) => {
  const parentTicketId = Number(req.params.id);
  if (!parentTicketId) return false;

  const parentTicket = await prisma.ticket.findUnique({
    where: { id: parentTicketId },
    select: {
      id: true,
      createdById: true,
      assignees: {
        where: { userId: user.id, removedAt: null },
        select: { id: true },
      },
    },
  });

  if (!parentTicket) return false;

  const isCreator = parentTicket.createdById === user.id;
  const isAssignee = parentTicket.assignees.length > 0;

  return isCreator || isAssignee;
};

// POST /api/tickets — Create Ticket: Admin (GLOBAL) or User (TEAM scope verified in service)
router.post(
  "/",
  authenticate,
  requirePermissionKey("TICKET_CREATE"),
  validate(createTicketSchema),
  ticketController.createTicket,
);

// GET /api/tickets — List Tickets (Admin GLOBAL sees all; User TEAM sees active team tickets)
router.get(
  "/",
  authenticate,
  requirePermissionKey("TICKET_VIEW"),
  validate(ticketQuerySchema),
  ticketController.listTickets,
);

// GET /api/tickets/stats — KPI dashboard stats (Placed BEFORE /:id to avoid param conflict)
router.get(
  "/stats",
  authenticate,
  ticketController.getTicketStats,
);

// GET /api/tickets/:id — View single ticket detail
router.get(
  "/:id",
  authenticate,
  requirePermissionKey("TICKET_VIEW"),
  validate(ticketIdParamSchema),
  ticketController.getTicketById,
);

// POST /api/tickets/:id/assignees — Add assignee to ticket (Admin GLOBAL, or User OWN creator)
router.post(
  "/:id/assignees",
  authenticate,
  requirePermission("TICKET_ASSIGN", resolveTicketCreator),
  validate(addAssigneeSchema),
  ticketController.addAssignee,
);

// DELETE /api/tickets/:id/assignees/:userId — Remove assignee from ticket (Admin GLOBAL, or User OWN creator)
router.delete(
  "/:id/assignees/:userId",
  authenticate,
  requirePermission("TICKET_ASSIGN", resolveTicketCreator),
  validate(removeAssigneeSchema),
  ticketController.removeAssignee,
);

// PATCH /api/tickets/:id/reassign — Full ticket reassignment (Admin GLOBAL only)
router.patch(
  "/:id/reassign",
  authenticate,
  requirePermission("TICKET_REASSIGN", resolveGlobal),
  validate(reassignTicketSchema),
  ticketController.reassignTicket,
);

// POST /api/tickets/:id/teams — Add collaborating team (Admin GLOBAL only)
router.post(
  "/:id/teams",
  authenticate,
  requirePermission("TICKET_TEAM_MANAGE", resolveGlobal),
  validate(addCollaboratingTeamSchema),
  ticketController.addCollaboratingTeam,
);

// DELETE /api/tickets/:id/teams/:teamId — Remove collaborating team (Admin GLOBAL only)
router.delete(
  "/:id/teams/:teamId",
  authenticate,
  requirePermission("TICKET_TEAM_MANAGE", resolveGlobal),
  validate(removeCollaboratingTeamSchema),
  ticketController.removeCollaboratingTeam,
);

// PATCH /api/tickets/:id/status — Change ticket status (Admin GLOBAL, User ASSIGNED)
router.patch(
  "/:id/status",
  authenticate,
  requirePermission("TICKET_CHANGE_STATUS", resolveTicketAssignee),
  validate(changeStatusSchema),
  ticketController.changeStatus,
);

// POST /api/tickets/:id/close — Close ticket (Admin GLOBAL, User ASSIGNED if Resolved)
router.post(
  "/:id/close",
  authenticate,
  requirePermission("TICKET_CLOSE", resolveTicketAssignee),
  validate(closeTicketSchema),
  ticketController.closeTicket,
);

// PATCH /api/tickets/:id/priority — Change ticket priority (Admin GLOBAL, User ASSIGNED)
router.patch(
  "/:id/priority",
  authenticate,
  requirePermission("TICKET_CHANGE_PRIORITY", resolveTicketAssignee),
  validate(changePrioritySchema),
  ticketController.changePriority,
);

// POST /api/tickets/:id/subtickets — Create sub-ticket under parent (Admin GLOBAL, User parent creator OWN or parent assignee ASSIGNED)
router.post(
  "/:id/subtickets",
  authenticate,
  requirePermission(
    "TICKET_CREATE_SUBTICKET",
    resolveParentTicketCreatorOrAssignee,
  ),
  validate(createSubTicketSchema),
  ticketController.createSubTicket,
);

module.exports = router;
