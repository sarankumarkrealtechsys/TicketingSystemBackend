const { Router } = require("express");
const { prisma } = require("../../lib/prisma");
const { authenticate } = require("../../middlewares/auth");
const { getPermissions } = require("../../services/auth/permission.service");
const { validate } = require("../../validators");
const {
  createTicketStatusSchema,
  updateTicketStatusSchema,
  ticketStatusIdParamSchema,
  ticketStatusQuerySchema,
} = require("../../validators/master-data/status.validator");
const {
  createTicketStatus,
  listTicketStatuses,
  getTicketStatusById,
  updateTicketStatus,
  retireTicketStatus,
  deleteTicketStatusPermanently,
} = require("../../controllers/master-data/status.controller");

const router = Router();

/**
 * Contextual Authorization for Status Creation:
 * - Team-specific (req.body.teamId): Allowed for active members of the team or Admin (STATUS_CREATE: GLOBAL).
 * - Global: Allowed only for Admin with STATUS_CREATE at GLOBAL scope.
 */
const authorizeStatusCreate = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Authentication required",
      });
    }

    const teamId = req.body.teamId ? Number(req.body.teamId) : null;
    const userPermissions = await getPermissions(req.user, req);
    const hasGlobalCreate = Boolean(userPermissions["STATUS_CREATE"]?.includes("GLOBAL"));

    if (teamId) {
      if (hasGlobalCreate) {
        return next();
      }

      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: req.user.id,
          teamId,
          removedAt: null,
        },
      });

      if (!membership) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden: You can only create workflow statuses for teams you are an active member of",
        });
      }

      return next();
    }

    if (!hasGlobalCreate) {
      return res.status(403).json({
        status: "error",
        message: "Forbidden: Creating global statuses requires STATUS_CREATE permission at GLOBAL scope",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Contextual Authorization for Status Update:
 * - Team-specific (status.teamId): Allowed for active members of the team or Admin (STATUS_UPDATE: GLOBAL).
 * - Global: Allowed only for Admin with STATUS_UPDATE at GLOBAL scope.
 */
const authorizeStatusUpdate = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Authentication required",
      });
    }

    const id = Number(req.params.id);
    const status = await prisma.ticketStatus.findUnique({ where: { id } });
    if (!status) {
      return res.status(404).json({
        status: "error",
        message: "Ticket status not found",
      });
    }

    const userPermissions = await getPermissions(req.user, req);
    const hasGlobalUpdate = Boolean(userPermissions["STATUS_UPDATE"]?.includes("GLOBAL"));

    if (status.teamId) {
      if (hasGlobalUpdate) {
        return next();
      }

      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: req.user.id,
          teamId: status.teamId,
          removedAt: null,
        },
      });

      if (!membership) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden: You can only update workflow statuses for teams you are an active member of",
        });
      }

      return next();
    }

    if (!hasGlobalUpdate) {
      return res.status(403).json({
        status: "error",
        message: "Forbidden: Updating global statuses requires STATUS_UPDATE permission at GLOBAL scope",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Contextual Authorization for Status Retirement:
 * - Default status (status.isDefault): Cannot be retired.
 * - Team-specific (status.teamId): Allowed for active members of the team or Admin (STATUS_RETIRE: GLOBAL).
 * - Global: Allowed only for Admin with STATUS_RETIRE at GLOBAL scope.
 */
const authorizeStatusRetire = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Authentication required",
      });
    }

    const id = Number(req.params.id);
    const status = await prisma.ticketStatus.findUnique({ where: { id } });
    if (!status) {
      return res.status(404).json({
        status: "error",
        message: "Ticket status not found",
      });
    }

    if (status.isDefault) {
      return res.status(400).json({
        status: "error",
        message: "System default statuses cannot be retired",
      });
    }

    const userPermissions = await getPermissions(req.user, req);
    const hasGlobalRetire = Boolean(userPermissions["STATUS_RETIRE"]?.includes("GLOBAL"));

    if (status.teamId) {
      if (hasGlobalRetire) {
        return next();
      }

      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: req.user.id,
          teamId: status.teamId,
          removedAt: null,
        },
      });

      if (!membership) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden: You can only retire workflow statuses for teams you are an active member of",
        });
      }

      return next();
    }

    if (!hasGlobalRetire) {
      return res.status(403).json({
        status: "error",
        message: "Forbidden: Retiring global statuses requires STATUS_RETIRE permission at GLOBAL scope",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

// POST /api/ticket-statuses — Global (Admin STATUS_CREATE) or Team-specific (Active team member)
router.post(
  "/",
  authenticate,
  validate(createTicketStatusSchema),
  authorizeStatusCreate,
  createTicketStatus,
);

// GET /api/ticket-statuses — Authenticated users
router.get(
  "/",
  authenticate,
  validate(ticketStatusQuerySchema),
  listTicketStatuses,
);

// GET /api/ticket-statuses/:id — Authenticated users
router.get(
  "/:id",
  authenticate,
  validate(ticketStatusIdParamSchema),
  getTicketStatusById,
);

// PATCH /api/ticket-statuses/:id — Global (Admin STATUS_UPDATE) or Team-specific (Active team member)
router.patch(
  "/:id",
  authenticate,
  validate(updateTicketStatusSchema),
  authorizeStatusUpdate,
  updateTicketStatus,
);

// DELETE /api/ticket-statuses/:id/permanent — Global (Admin STATUS_RETIRE) or Team-specific (Active team member)
router.delete(
  "/:id/permanent",
  authenticate,
  validate(ticketStatusIdParamSchema),
  authorizeStatusRetire,
  deleteTicketStatusPermanently,
);

// DELETE /api/ticket-statuses/:id — Global (Admin STATUS_RETIRE) or Team-specific (Active team member)
router.delete(
  "/:id",
  authenticate,
  validate(ticketStatusIdParamSchema),
  authorizeStatusRetire,
  retireTicketStatus,
);

module.exports = router;
