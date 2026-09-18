const { Router } = require("express");
const { prisma } = require("../../lib/prisma");
const { authenticate } = require("../../middlewares/auth");
const {
  requirePermission,
  requirePermissionKey,
} = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const { upload } = require("../../middlewares/upload");
const { uploadRateLimiter } = require("../../middlewares/rateLimiter");
const {
  createTicketSchema,
  updateTicketSchema,
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
  addRemarkSchema,
} = require("../../validators/ticket/ticket.validator");
const {
  ticketAttachmentParamSchema,
  ticketAttachmentUploadParamSchema,
  validateUploadedFile,
} = require("../../validators/ticket/ticket-attachment.validator");
const ticketController = require("../../controllers/ticket/ticket.controller");
const ticketAttachmentController = require("../../controllers/ticket/ticket-attachment.controller");
const ticketHistoryController = require("../../controllers/ticket/ticket-history.controller");
const timeEntryController = require("../../controllers/ticket/time-entry.controller");
const {
  ticketHistoryQuerySchema,
} = require("../../validators/ticket/ticket-history.validator");
const {
  createTimeEntrySchema,
  ticketTimeSummaryQuerySchema,
  ticketTimeEntriesQuerySchema,
} = require("../../validators/ticket/time-entry.validator");

const router = Router();

/**
 * Scope resolver for TICKET_VIEW.
 * Admin (GLOBAL scope) automatically short-circuits in requirePermission.
 * Standard user:
 * - Allowed if caller is the ticket creator (createdById === user.id)
 * - Allowed if caller is an active assignee on the ticket
 * - Allowed if caller is an active member of the primary team or a collaborating team.
 */
const resolveTicketView = async (user, _resource, req) => {
  const ticketId = Number(req.params.id);
  if (!ticketId) return false;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      teamId: true,
      createdById: true,
      collaboratingTeams: {
        where: { removedAt: null },
        select: { teamId: true },
      },
      assignees: {
        where: { removedAt: null, userId: user.id },
        select: { id: true },
      },
    },
  });
  if (!ticket) return false;

  if (ticket.createdById === user.id || ticket.assignees.length > 0) {
    return true;
  }

  const allowedTeamIds = [
    ticket.teamId,
    ...ticket.collaboratingTeams.map((ct) => ct.teamId),
  ];

  const isMember = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId: { in: allowedTeamIds },
      removedAt: null,
    },
  });

  return !!isMember;
};

/**
 * Scope resolver for TICKET_ATTACHMENT_MANAGE (OWN or ASSIGNED).
 * Admin (GLOBAL scope) automatically short-circuits in requirePermission.
 * Standard user must be either:
 * - The ticket creator (OWN scope), OR
 * - An active assignee on the ticket (ASSIGNED scope).
 * Zero redundant getPermissions() calls.
 */
const resolveTicketAttachmentManage = async (user, _resource, req) => {
  const ticketId = Number(req.params.id);
  if (!ticketId) return false;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      createdById: true,
      assignees: {
        where: { userId: user.id, removedAt: null },
        select: { id: true },
      },
    },
  });
  if (!ticket) return false;

  const isCreator = Number(ticket.createdById) === Number(user.id);
  const isAssignee = ticket.assignees.length > 0;

  return isCreator || isAssignee;
};

const resolveTicketCreatorOrAssignee = resolveTicketAttachmentManage;

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

/**
 * Scope resolver for TICKET_HISTORY_VIEW (strictly OWN + ASSIGNED).
 * Admin (GLOBAL scope) automatically short-circuits in requirePermission.
 * Standard user must be either:
 * - The ticket creator (OWN scope), OR
 * - An active assignee on the ticket (ASSIGNED scope).
 * Strictly OWN + ASSIGNED — no TEAM scope.
 */
const resolveTicketHistoryView = async (user, _resource, req) => {
  const ticketId = Number(req.params.id);
  if (!ticketId) return false;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      createdById: true,
      assignees: {
        where: { removedAt: null, userId: user.id },
        select: { id: true },
      },
    },
  });
  if (!ticket) return false;

  return ticket.createdById === user.id || ticket.assignees.length > 0;
};

/**
 * Scope resolver for TICKET_LOG_TIME (strictly OWN scope for standard user).
 * Admin (GLOBAL scope) automatically short-circuits in requirePermission.
 * Standard user must be an active assignee on the ticket.
 */
const resolveTicketLogTime = async (user, _resource, req) => {
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
  requirePermissionKey("TICKET_VIEW"),
  ticketController.getTicketStats,
);

// GET /api/tickets/:id/history — View ticket audit history (Placed BEFORE generic /:id to prevent route shadowing)
router.get(
  "/:id/history",
  authenticate,
  validate(ticketIdParamSchema),
  requirePermission("TICKET_HISTORY_VIEW", resolveTicketHistoryView),
  validate(ticketHistoryQuerySchema),
  ticketHistoryController.getTicketHistory,
);

// POST /api/tickets/:id/time-entries — Log time against ticket (Placed BEFORE generic /:id)
router.post(
  "/:id/time-entries",
  authenticate,
  validate(createTimeEntrySchema),
  requirePermission("TICKET_LOG_TIME", resolveTicketLogTime),
  timeEntryController.logTime,
);

// GET /api/tickets/:id/time-entries/summary — Aggregate time summary for ticket (Placed BEFORE generic /:id)
router.get(
  "/:id/time-entries/summary",
  authenticate,
  validate(ticketTimeSummaryQuerySchema),
  requirePermission("TICKET_VIEW", resolveTicketView),
  timeEntryController.getTicketTimeSummary,
);

// GET /api/tickets/:id/time-entries — List time entries for ticket (Placed BEFORE generic /:id)
router.get(
  "/:id/time-entries",
  authenticate,
  validate(ticketTimeEntriesQuerySchema),
  requirePermission("TICKET_VIEW", resolveTicketView),
  timeEntryController.listTicketTimeEntries,
);

// GET /api/tickets/:id — View single ticket detail (Gated by team-scope resolver)
router.get(
  "/:id",
  authenticate,
  validate(ticketIdParamSchema),
  requirePermission("TICKET_VIEW", resolveTicketView),
  ticketController.getTicketById,
);

// PATCH /api/tickets/:id — Update ticket summary, description, and custom fields (Admin GLOBAL, User ASSIGNED)
router.patch(
  "/:id",
  authenticate,
  requirePermission("TICKET_UPDATE", resolveTicketAssignee),
  validate(updateTicketSchema),
  ticketController.updateTicket,
);

// POST /api/tickets/:id/attachments — Upload ticket attachment
// Authorization checked BEFORE multer streaming to disk
router.post(
  "/:id/attachments",
  authenticate,
  validate(ticketAttachmentUploadParamSchema),
  requirePermission(
    "TICKET_ATTACHMENT_MANAGE",
    resolveTicketAttachmentManage,
  ),
  uploadRateLimiter,
  upload.single("file"),
  validateUploadedFile,
  ticketAttachmentController.uploadAttachment,
);

// GET /api/tickets/:id/attachments/:attachmentId/download — Download attachment
// Gated by the exact same team-scope resolver as ticket viewing
router.get(
  "/:id/attachments/:attachmentId/download",
  authenticate,
  validate(ticketAttachmentParamSchema),
  requirePermission("TICKET_VIEW", resolveTicketView),
  ticketAttachmentController.downloadAttachment,
);

// DELETE /api/tickets/:id/attachments/:attachmentId — Soft-delete attachment
// Retains physical file on disk for audit integrity
router.delete(
  "/:id/attachments/:attachmentId",
  authenticate,
  validate(ticketAttachmentParamSchema),
  requirePermission(
    "TICKET_ATTACHMENT_MANAGE",
    resolveTicketAttachmentManage,
  ),
  ticketAttachmentController.deleteAttachment,
);

// POST /api/tickets/:id/assignees — Add assignee to ticket (Admin GLOBAL, User OWN creator)
router.post(
  "/:id/assignees",
  authenticate,
  requirePermission("TICKET_ASSIGN", resolveTicketCreator),
  validate(addAssigneeSchema),
  ticketController.addAssignee,
);

// DELETE /api/tickets/:id/assignees/:userId — Remove assignee from ticket (Admin GLOBAL, User OWN creator)
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

// POST /api/tickets/:id/remarks — Add remark to ticket (Admin GLOBAL, User OWN or ASSIGNED)
router.post(
  "/:id/remarks",
  authenticate,
  requirePermission("TICKET_ADD_REMARK", resolveTicketCreatorOrAssignee),
  validate(addRemarkSchema),
  ticketController.addRemark,
);

module.exports = router;
