const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { getIO } = require("../../lib/socket");
const { logger } = require("../../config/logger");
const {
  isInAppNotificationsEnabled,
} = require("../admin/settings.service");


/**
 * Creates an in-app notification record in the database.
 * Supports passing an existing Prisma transaction client (tx) or uses the default prisma client.
 *
 * @param {Object} params
 * @param {number} params.userId - Recipient user ID
 * @param {number|null} [params.actorId] - User ID who triggered the action
 * @param {number|null} [params.ticketId] - Related ticket ID
 * @param {string} [params.type='TICKET_ASSIGNED'] - NotificationType enum value
 * @param {string} params.title - Short notification title
 * @param {string} params.message - Descriptive notification body
 * @param {import("@prisma/client").PrismaClient} [tx] - Optional transaction client
 * @returns {Promise<Object>} Created notification record
 */
const createNotification = async (
  { userId, actorId, ticketId, type = "TICKET_ASSIGNED", title, message },
  tx = null,
) => {
  const client = tx || prisma;

  return client.notification.create({
    data: {
      userId: Number(userId),
      actorId: actorId ? Number(actorId) : null,
      ticketId: ticketId ? Number(ticketId) : null,
      type,
      title,
      message,
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
        },
      },
    },
  });
};

/**
 * Retrieves notifications for the authenticated user, strictly scoped to their userId.
 * Supports pagination, unread filtering, and search for the notification history panel.
 *
 * @param {number} userId - The authenticated user's ID
 * @param {Object} [options]
 * @param {boolean} [options.unreadOnly=false] - Filter to unread notifications only
 * @param {string} [options.filter='all'] - 'all' | 'unread' | 'read'
 * @param {string} [options.search=''] - Search term across title, message, ticket
 * @param {number} [options.page=1] - Page number (1-based)
 * @param {number} [options.limit=20] - Number of items to return
 * @returns {Promise<{ notifications: Array, unreadCount: number, totalCount: number, page: number, limit: number, totalPages: number }>}
 */
const getUserNotifications = async (
  userId,
  { unreadOnly = false, filter = "all", search = "", page = 1, limit = 20 } = {},
) => {
  const numUserId = Number(userId);
  const pageNum = Math.max(Number(page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (pageNum - 1) * pageSize;

  const whereClause = {
    userId: numUserId,
  };

  if (unreadOnly || filter === "unread") {
    whereClause.isRead = false;
  } else if (filter === "read") {
    whereClause.isRead = true;
  }

  if (search && search.trim()) {
    const q = search.trim();
    whereClause.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
      {
        ticket: {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [notifications, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            summary: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({
      where: whereClause,
    }),
    prisma.notification.count({
      where: {
        userId: numUserId,
        isRead: false,
      },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    notifications,
    unreadCount,
    totalCount,
    page: pageNum,
    limit: pageSize,
    totalPages,
  };
};

/**
 * Marks a single notification as read.
 * Distinguishes 404 (not found) from 403 (belongs to a different user).
 *
 * @param {number} userId - Authenticated user's ID
 * @param {number} notificationId - Target notification ID
 * @returns {Promise<{ success: boolean }>}
 */
const markNotificationAsRead = async (userId, notificationId) => {
  const numUserId = Number(userId);
  const numId = Number(notificationId);

  // Attempt atomic update scoped strictly to this user
  const result = await prisma.notification.updateMany({
    where: {
      id: numId,
      userId: numUserId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    // Check if notification exists at all or belongs to another user
    const existing = await prisma.notification.findUnique({
      where: { id: numId },
      select: { id: true, userId: true, isRead: true },
    });

    if (!existing) {
      throw new AppError("Notification not found", 404);
    }

    if (existing.userId !== numUserId) {
      throw new AppError(
        "Forbidden: You cannot modify another user's notifications",
        403,
      );
    }

    // If it belongs to this user but was already read, return success idempotently
  }

  return { success: true };
};

/**
 * Marks all unread notifications as read for the authenticated user.
 *
 * @param {number} userId - Authenticated user's ID
 * @returns {Promise<{ count: number }>}
 */
const markAllNotificationsAsRead = async (userId) => {
  const numUserId = Number(userId);

  const result = await prisma.notification.updateMany({
    where: {
      userId: numUserId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return { count: result.count };
};

/**
 * Persists an in-app notification to the database and dispatches a real-time
 * Socket.IO event to the recipient's personal room ('user:{userId}').
 *
 * @param {Object} params
 * @returns {Promise<Object>} Created notification record
 */
const dispatchAndPersistNotification = async (params) => {
  const enabled = await isInAppNotificationsEnabled();
  if (!enabled) {
    logger.info(
      `[InAppNotification] In-app notifications globally disabled; skipping dispatch and persistence for user:${params?.userId}.`,
    );
    return null;
  }

  const record = await createNotification(params);

  try {
    const io = getIO();
    io.to(`user:${params.userId}`).emit("notification:new", record);
    logger.info(
      `[InAppNotification] Real-time notification dispatched to user:${params.userId} for ticket ${params.ticketId || "N/A"}`,
    );
  } catch (error) {
    logger.warn(
      `[InAppNotification] Socket.IO emit failed for user:${params.userId}: ${error.message}`,
    );
  }

  return record;
};

/**
 * Dispatches an in-app notification when a user is assigned to an existing ticket.
 */
const notifyInAppAssigneeAdded = ({
  ticketId,
  ticketNumber,
  summary,
  assigneeUserId,
  actor,
}) => {
  const targetUserId = Number(assigneeUserId);
  if (!targetUserId || targetUserId === Number(actor?.id)) return;

  setImmediate(async () => {
    try {
      await dispatchAndPersistNotification({
        userId: targetUserId,
        actorId: actor?.id ? Number(actor.id) : null,
        ticketId: Number(ticketId),
        type: "TICKET_ASSIGNED",
        title: `Assigned to Ticket #${ticketNumber}`,
        message: `${actor?.name || "Someone"} assigned you to ticket #${ticketNumber}: "${summary}"`,
      });
    } catch (err) {
      logger.error(
        `[InAppNotification] Failed to dispatch assignee added notification for ticket #${ticketNumber}: ${err.message}`,
      );
    }
  });
};

/**
 * Dispatches in-app notifications when a ticket is reassigned.
 */
const notifyInAppTicketReassigned = ({
  ticketId,
  ticketNumber,
  summary,
  assigneeUserIds = [],
  teamName,
  actor,
}) => {
  const actorId = actor?.id ? Number(actor.id) : null;
  const uniqueRecipients = [
    ...new Set(assigneeUserIds.map(Number).filter((id) => id && id !== actorId)),
  ];

  if (uniqueRecipients.length === 0) return;

  setImmediate(async () => {
    for (const uid of uniqueRecipients) {
      try {
        await dispatchAndPersistNotification({
          userId: uid,
          actorId,
          ticketId: Number(ticketId),
          type: "TICKET_ASSIGNED",
          title: `Ticket #${ticketNumber} Reassigned`,
          message: `${actor?.name || "Someone"} reassigned ticket #${ticketNumber} to ${teamName || "a new team"}: "${summary}"`,
        });
      } catch (err) {
        logger.error(
          `[InAppNotification] Failed to dispatch reassignment notification for ticket #${ticketNumber} to user ${uid}: ${err.message}`,
        );
      }
    }
  });
};

/**
 * Dispatches in-app notifications for ticket status transitions: Resolved, Closed, Reopened.
 */
const notifyInAppStatusChanged = ({
  ticket,
  previousBehavior,
  newBehavior,
  newStatusLabel,
  actor,
}) => {
  if (!ticket || !ticket.id) return;

  setImmediate(async () => {
    try {
      // 1. Resolve recipients: ticket creator + active assignees
      const activeAssignees = await prisma.ticketAssignee.findMany({
        where: { ticketId: ticket.id, removedAt: null },
        select: { userId: true },
      });

      const actorId = actor?.id ? Number(actor.id) : null;
      const recipientIds = new Set();

      if (ticket.createdById && Number(ticket.createdById) !== actorId) {
        recipientIds.add(Number(ticket.createdById));
      }

      for (const a of activeAssignees) {
        if (a.userId && Number(a.userId) !== actorId) {
          recipientIds.add(Number(a.userId));
        }
      }

      if (recipientIds.size === 0) return;

      // 2. Format title and message based on transition behavior
      let title;
      let message;

      if (newBehavior === "RESOLVED") {
        title = `Ticket #${ticket.ticketNumber} Resolved`;
        message = `${actor?.name || "Someone"} marked ticket #${ticket.ticketNumber} as Resolved ("${ticket.summary}")`;
      } else if (newBehavior === "CLOSED") {
        title = `Ticket #${ticket.ticketNumber} Closed`;
        message = `${actor?.name || "Someone"} closed ticket #${ticket.ticketNumber} ("${ticket.summary}")`;
      } else if (
        (previousBehavior === "RESOLVED" || previousBehavior === "CLOSED") &&
        (newBehavior === "OPEN" || newBehavior === "IN_PROGRESS")
      ) {
        title = `Ticket #${ticket.ticketNumber} Reopened`;
        message = `${actor?.name || "Someone"} reopened ticket #${ticket.ticketNumber} back to ${newStatusLabel || "In Progress"} ("${ticket.summary}")`;
      } else {
        title = `Ticket #${ticket.ticketNumber} Status: ${newStatusLabel || "Updated"}`;
        message = `${actor?.name || "Someone"} updated ticket #${ticket.ticketNumber} status to ${newStatusLabel || "new status"} ("${ticket.summary}")`;
      }

      // 3. Dispatch to all recipients
      for (const uid of recipientIds) {
        await dispatchAndPersistNotification({
          userId: uid,
          actorId,
          ticketId: ticket.id,
          type: "TICKET_ASSIGNED",
          title,
          message,
        });
      }
    } catch (err) {
      logger.error(
        `[InAppNotification] Failed to dispatch status notification for ticket #${ticket.ticketNumber}: ${err.message}`,
      );
    }
  });
};

/**
 * Dispatches in-app notifications for ticket priority changes & escalations.
 */
const notifyInAppPriorityChanged = ({
  ticket,
  previousPriorityLabel,
  newPriorityLabel,
  actor,
}) => {
  if (!ticket || !ticket.id) return;

  setImmediate(async () => {
    try {
      const activeAssignees = await prisma.ticketAssignee.findMany({
        where: { ticketId: ticket.id, removedAt: null },
        select: { userId: true },
      });

      const actorId = actor?.id ? Number(actor.id) : null;
      const recipientIds = new Set();

      if (ticket.createdById && Number(ticket.createdById) !== actorId) {
        recipientIds.add(Number(ticket.createdById));
      }

      for (const a of activeAssignees) {
        if (a.userId && Number(a.userId) !== actorId) {
          recipientIds.add(Number(a.userId));
        }
      }

      if (recipientIds.size === 0) return;

      const isEscalation = /high|critical|urgent/i.test(newPriorityLabel || "");
      const title = isEscalation
        ? `Ticket #${ticket.ticketNumber} Escalated: ${newPriorityLabel}`
        : `Ticket #${ticket.ticketNumber} Priority: ${newPriorityLabel}`;
      const message = `${actor?.name || "Someone"} changed priority of ticket #${ticket.ticketNumber} from ${previousPriorityLabel || "Normal"} to ${newPriorityLabel || "Updated"} ("${ticket.summary}")`;

      for (const uid of recipientIds) {
        await dispatchAndPersistNotification({
          userId: uid,
          actorId,
          ticketId: ticket.id,
          type: "TICKET_ASSIGNED",
          title,
          message,
        });
      }
    } catch (err) {
      logger.error(
        `[InAppNotification] Failed to dispatch priority notification for ticket #${ticket.ticketNumber}: ${err.message}`,
      );
    }
  });
};

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dispatchAndPersistNotification,
  notifyInAppAssigneeAdded,
  notifyInAppTicketReassigned,
  notifyInAppStatusChanged,
  notifyInAppPriorityChanged,
};
