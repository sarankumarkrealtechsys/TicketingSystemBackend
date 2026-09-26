const { isEmailNotificationsEnabled } = require("../admin/settings.service");
const emailService = require("./email.service");
const templateService = require("./template.service");
const recipientService = require("./recipient.service");
const { logger } = require("../../config/logger");

/**
 * Dispatches an email to a list of deduplicated recipients asynchronously.
 * Guarantees zero blocking / zero exception leakage to the caller.
 *
 * @param {Array<{ email: string, name?: string }>} recipients
 * @param {Object} renderedContent { subject, html, text }
 * @param {string} eventName
 * @returns {Promise<void>}
 */
const dispatchToRecipients = async (recipients, renderedContent, eventName) => {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    logger.debug(`[Notification] Zero recipients resolved for ${eventName}; skipping.`);
    return;
  }

  for (const recipient of recipients) {
    try {
      await emailService.sendEmail({
        to: recipient.email,
        subject: renderedContent.subject,
        text: renderedContent.text,
        html: renderedContent.html,
      });
    } catch (err) {
      logger.error(
        `[Notification] Unexpected error sending ${eventName} to ${recipient.email}: ${err.message}`,
      );
    }
  }
};

/**
 * Helper to execute notification dispatch in the next tick of the event loop.
 */
const runAsync = (fn, eventName) => {
  setImmediate(async () => {
    try {
      // 1. Central PostgreSQL toggle check (NO Redis)
      const enabled = await isEmailNotificationsEnabled();
      if (!enabled) {
        logger.info(
          `[Notification] Email notifications globally disabled; skipping ${eventName} dispatch.`,
        );
        return;
      }

      await fn();
    } catch (err) {
      logger.error(`[Notification] Background error in ${eventName}: ${err.message}`);
    }
  });
};

/**
 * 1. Ticket Created Event
 * - Creator receives the "Ticket Created" template
 * - Assignees & Team Leads receive the "Ticket Assigned to You" template
 */
const notifyTicketCreated = (ticket, actor) => {
  runAsync(async () => {
    const freshTicket =
      (await recipientService.fetchTicketNotificationContext(ticket.id)) || ticket;

    // 1. Send "Ticket Created" exclusively to the creator
    const creatorRecipients =
      recipientService.resolveTicketCreatedCreatorRecipients(freshTicket);
    if (creatorRecipients.length > 0) {
      const creatorRendered = templateService.renderTicketCreated(freshTicket);
      await dispatchToRecipients(
        creatorRecipients,
        creatorRendered,
        "TICKET_CREATED_CREATOR",
      );
    }

    // 2. Send "Ticket Assigned to You" to all assignees and team leads (excluding creator)
    const assigneeRecipients =
      recipientService.resolveTicketCreatedAssigneeRecipients(freshTicket);
    if (assigneeRecipients.length > 0) {
      for (const recipient of assigneeRecipients) {
        const assigneeRendered = templateService.renderTicketAssigned(
          freshTicket,
          recipient.name,
        );
        await dispatchToRecipients(
          [recipient],
          assigneeRendered,
          "TICKET_ASSIGNED",
        );
      }
    }

    // 3. If this is a sub-ticket, notify parent ticket stakeholders
    if (freshTicket.parentTicket) {
      const alreadyNotifiedEmails = [
        ...creatorRecipients.map((r) => r.email),
        ...assigneeRecipients.map((r) => r.email),
      ];
      if (actor?.email) alreadyNotifiedEmails.push(actor.email);

      const parentRecipients =
        recipientService.resolveSubTicketCreatedParentRecipients(
          freshTicket,
          alreadyNotifiedEmails,
        );

      if (parentRecipients.length > 0) {
        const parentRendered = templateService.renderSubTicketCreatedForParent(
          freshTicket.parentTicket,
          freshTicket,
          actor,
        );
        await dispatchToRecipients(
          parentRecipients,
          parentRendered,
          "SUBTICKET_CREATED_PARENT",
        );
      }
    }
  }, "TICKET_CREATED");
};

/**
 * 2. Ticket Resolved Event
 */
const notifyTicketResolved = (
  ticketIdOrTicket,
  { previousStatusLabel, newStatusLabel, remarks },
  actor,
) => {
  const ticketId =
    typeof ticketIdOrTicket === "object" ? ticketIdOrTicket.id : ticketIdOrTicket;

  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const currentStatusLabel =
      newStatusLabel || freshTicket.status?.label || "Resolved";
    const recipients = recipientService.resolveStatusChangedRecipients(freshTicket);
    const rendered = templateService.renderTicketResolved(
      freshTicket,
      previousStatusLabel,
      currentStatusLabel,
      remarks,
    );
    await dispatchToRecipients(recipients, rendered, "TICKET_RESOLVED");
  }, "TICKET_RESOLVED");
};

/**
 * 3. Ticket Closed Event
 */
const notifyTicketClosed = (
  ticketIdOrTicket,
  { previousStatusLabel, newStatusLabel, remarks },
  actor,
) => {
  const ticketId =
    typeof ticketIdOrTicket === "object" ? ticketIdOrTicket.id : ticketIdOrTicket;

  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const currentStatusLabel =
      newStatusLabel || freshTicket.status?.label || "Closed";
    const recipients = recipientService.resolveStatusChangedRecipients(freshTicket);
    const rendered = templateService.renderTicketClosed(
      freshTicket,
      previousStatusLabel,
      currentStatusLabel,
      remarks,
    );
    await dispatchToRecipients(recipients, rendered, "TICKET_CLOSED");
  }, "TICKET_CLOSED");
};

/**
 * 4. Ticket Reassigned Event
 */
const notifyTicketReassigned = (ticketId, reassignedTicket, actor) => {
  runAsync(async () => {
    const freshTicket =
      await recipientService.fetchTicketNotificationContext(
        typeof ticketId === "object" ? ticketId : Number(ticketId),
      );
    if (!freshTicket) return;

    const newTeamName = freshTicket.team?.name || "Unknown Team";
    const newAssigneeNames = (freshTicket.assignees || [])
      .map((a) => a.user?.name || "Unknown")
      .join(", ");

    const recipients = recipientService.resolveReassignmentRecipients(freshTicket);
    const rendered = templateService.renderTicketReassigned(
      freshTicket,
      newTeamName,
      newAssigneeNames,
      typeof reassignedTicket === "object" ? reassignedTicket.remarks : undefined,
    );
    await dispatchToRecipients(recipients, rendered, "TICKET_REASSIGNED");
  }, "TICKET_REASSIGNED");
};

/**
 * 5. Ticket Deleted Event
 */
const notifyTicketDeleted = (ticketContext, actor, remarks) => {
  runAsync(async () => {
    if (!ticketContext) return;
    const recipients = recipientService.resolveTicketDeletedRecipients(ticketContext);
    const actorName = actor?.name || "System Admin";
    const rendered = templateService.renderTicketDeleted(
      ticketContext,
      actorName,
      remarks,
    );
    await dispatchToRecipients(recipients, rendered, "TICKET_DELETED");
  }, "TICKET_DELETED");
};

/**
 * 6. Assignee Added to Ticket Event
 * Dispatches "Ticket Assigned to You" email to the newly assigned engineer.
 *
 * @param {number} ticketId
 * @param {{ id: number, name: string, email: string }} assigneeUser
 * @param {Object} actor
 */
const notifyAssigneeAdded = (ticketId, assigneeUser, actor) => {
  runAsync(async () => {
    if (!assigneeUser || !assigneeUser.email) return;

    // Do not email the actor if they assigned themselves
    if (actor?.id && Number(actor.id) === Number(assigneeUser.id)) return;

    const freshTicket = await recipientService.fetchTicketNotificationContext(
      typeof ticketId === "object" ? ticketId.id : Number(ticketId),
    );
    if (!freshTicket) return;

    const recipient = {
      email: assigneeUser.email,
      name: assigneeUser.name || "Engineer",
      userId: assigneeUser.id,
      role: "Assignee",
    };

    const rendered = templateService.renderTicketAssigned(
      freshTicket,
      assigneeUser.name || "Engineer",
    );

    await dispatchToRecipients([recipient], rendered, "TICKET_ASSIGNEE_ADDED");
  }, "TICKET_ASSIGNEE_ADDED");
};

/**
 * 7. Assignee Removed from Ticket Event
 * Dispatches "Assignment Removed" email to the unassigned engineer.
 *
 * @param {number} ticketId
 * @param {{ id: number, name: string, email: string }} removedUser
 * @param {Object} actor
 */
const notifyAssigneeRemoved = (ticketId, removedUser, actor) => {
  runAsync(async () => {
    if (!removedUser || !removedUser.email) return;

    // Do not email the actor if they removed themselves
    if (actor?.id && Number(actor.id) === Number(removedUser.id)) return;

    const freshTicket = await recipientService.fetchTicketNotificationContext(
      typeof ticketId === "object" ? ticketId.id : Number(ticketId),
    );
    if (!freshTicket) return;

    const recipient = {
      email: removedUser.email,
      name: removedUser.name || "Engineer",
      userId: removedUser.id,
      role: "Assignee",
    };

    const rendered = templateService.renderTicketAssigneeRemoved(
      freshTicket,
      removedUser.name || "Engineer",
      actor?.name || "Team Member",
    );

    await dispatchToRecipients([recipient], rendered, "TICKET_ASSIGNEE_REMOVED");
  }, "TICKET_ASSIGNEE_REMOVED");
};

module.exports = {
  notifyTicketCreated,
  notifyTicketResolved,
  notifyTicketClosed,
  notifyTicketReassigned,
  notifyTicketDeleted,
  notifyAssigneeAdded,
  notifyAssigneeRemoved,
};


