const { isEmailNotificationsEnabled } = require("../admin/settings.service");
const emailService = require("./email.service");
const templateService = require("./template.service");
const recipientService = require("./recipient.service");
const { prisma } = require("../../lib/prisma");
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
 */
const notifyTicketCreated = (ticket, actor) => {
  runAsync(async () => {
    const freshTicket =
      (await recipientService.fetchTicketNotificationContext(ticket.id)) || ticket;
    const recipients = recipientService.resolveTicketCreatedRecipients(freshTicket);
    const rendered = templateService.renderTicketCreated(freshTicket);
    await dispatchToRecipients(recipients, rendered, "TICKET_CREATED");
  }, "TICKET_CREATED");
};

/**
 * 2. Status Changed Event
 */
const notifyStatusChanged = (
  ticketIdOrTicket,
  { previousStatusLabel, newStatusLabel, remarks },
  actor,
) => {
  const ticketId =
    typeof ticketIdOrTicket === "object" ? ticketIdOrTicket.id : ticketIdOrTicket;

  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const currentStatusLabel = newStatusLabel || freshTicket.status?.label || "Unknown";
    const recipients = recipientService.resolveStatusChangedRecipients(freshTicket);
    const rendered = templateService.renderStatusChanged(
      freshTicket,
      previousStatusLabel,
      currentStatusLabel,
      remarks,
    );
    await dispatchToRecipients(recipients, rendered, "STATUS_CHANGED");
  }, "STATUS_CHANGED");
};

/**
 * 3. Assignee Added Event
 */
const notifyAssigneeAdded = (ticketId, assigneeUser, actor) => {
  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const recipients = recipientService.resolveAssigneeAddedRecipients(assigneeUser);
    const rendered = templateService.renderAssigneeAdded(
      freshTicket,
      assigneeUser.name,
    );
    await dispatchToRecipients(recipients, rendered, "ASSIGNEE_ADDED");
  }, "ASSIGNEE_ADDED");
};

/**
 * 4. Assignee Removed Event
 */
const notifyAssigneeRemoved = (ticketId, removedUser, actor) => {
  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const recipients = recipientService.resolveAssigneeRemovedRecipients(removedUser);
    const rendered = templateService.renderAssigneeRemoved(
      freshTicket,
      removedUser.name,
    );
    await dispatchToRecipients(recipients, rendered, "ASSIGNEE_REMOVED");
  }, "ASSIGNEE_REMOVED");
};

/**
 * 5. Priority Changed Event
 */
const notifyPriorityChanged = (
  ticketIdOrTicket,
  { previousPriorityLabel, newPriorityLabel, remarks },
  actor,
) => {
  const ticketId =
    typeof ticketIdOrTicket === "object" ? ticketIdOrTicket.id : ticketIdOrTicket;

  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const currentPriorityLabel =
      newPriorityLabel || freshTicket.priority?.label || "Unknown";
    const recipients = recipientService.resolvePriorityChangedRecipients(freshTicket);
    const rendered = templateService.renderPriorityChanged(
      freshTicket,
      previousPriorityLabel,
      currentPriorityLabel,
      remarks,
    );
    await dispatchToRecipients(recipients, rendered, "PRIORITY_CHANGED");
  }, "PRIORITY_CHANGED");
};

/**
 * 6. New Remark Event
 */
const notifyNewRemark = (ticketId, remarkData, actor) => {
  runAsync(async () => {
    const freshTicket = await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const remarkText = typeof remarkData === "string" ? remarkData : remarkData?.remarks;
    const recipients = recipientService.resolveNewRemarkRecipients(freshTicket);
    const rendered = templateService.renderNewRemark(
      freshTicket,
      remarkText,
      actor?.name,
    );
    await dispatchToRecipients(recipients, rendered, "NEW_REMARK");
  }, "NEW_REMARK");
};

/**
 * 7. Sub-Ticket Created Event
 */
const notifySubTicketCreated = (subTicket, parentTicketId, actor) => {
  runAsync(async () => {
    const [freshSubTicket, freshParentTicket] = await Promise.all([
      recipientService.fetchTicketNotificationContext(subTicket.id),
      parentTicketId
        ? recipientService.fetchTicketNotificationContext(parentTicketId)
        : null,
    ]);

    if (!freshSubTicket) return;

    const recipients = recipientService.resolveSubTicketCreatedRecipients(
      freshSubTicket,
      freshParentTicket,
    );
    const rendered = templateService.renderSubTicketCreated(
      freshSubTicket,
      freshParentTicket,
    );
    await dispatchToRecipients(recipients, rendered, "SUB_TICKET_CREATED");
  }, "SUB_TICKET_CREATED");
};

/**
 * 8. Collaborating Team Added Event
 */
const notifyCollaboratingTeamAdded = (ticketId, collaboratingTeamId) => {
  runAsync(async () => {
    const freshTicket =
      await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const collabTeam = await prisma.team.findUnique({
      where: { id: Number(collaboratingTeamId) },
      select: { id: true, name: true, teamAdminEmail: true, status: true },
    });
    if (!collabTeam || collabTeam.status !== "ACTIVE") return;

    const recipients =
      recipientService.resolveCollaboratingTeamAddedRecipients(collabTeam);
    const rendered = templateService.renderCollaboratingTeamAdded(
      freshTicket,
      collabTeam.name,
    );
    await dispatchToRecipients(recipients, rendered, "COLLABORATING_TEAM_ADDED");
  }, "COLLABORATING_TEAM_ADDED");
};

/**
 * 9. Ticket Reassigned Event
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
    );
    await dispatchToRecipients(recipients, rendered, "TICKET_REASSIGNED");
  }, "TICKET_REASSIGNED");
};

/**
 * 10. Collaborating Team Removed Event
 */
const notifyCollaboratingTeamRemoved = (ticketId, removedTeamId) => {
  runAsync(async () => {
    const freshTicket =
      await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const removedTeam = await prisma.team.findUnique({
      where: { id: Number(removedTeamId) },
      select: { id: true, name: true, teamAdminEmail: true, status: true },
    });
    if (!removedTeam) return;

    const recipients =
      recipientService.resolveCollaboratingTeamRemovedRecipients(removedTeam);
    const rendered = templateService.renderCollaboratingTeamRemoved(
      freshTicket,
      removedTeam.name,
    );
    await dispatchToRecipients(recipients, rendered, "COLLABORATING_TEAM_REMOVED");
  }, "COLLABORATING_TEAM_REMOVED");
};

/**
 * 11. Attachment Added Event
 */
const notifyAttachmentAdded = (ticketId, attachment, actor) => {
  runAsync(async () => {
    const freshTicket =
      await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const fileName = attachment?.originalFileName || "Unknown File";
    const recipients = recipientService.resolveAttachmentRecipients(freshTicket);
    const rendered = templateService.renderAttachmentAdded(
      freshTicket,
      fileName,
      actor?.name,
    );
    await dispatchToRecipients(recipients, rendered, "ATTACHMENT_ADDED");
  }, "ATTACHMENT_ADDED");
};

/**
 * 12. Attachment Removed Event
 */
const notifyAttachmentRemoved = (ticketId, attachment, actor) => {
  runAsync(async () => {
    const freshTicket =
      await recipientService.fetchTicketNotificationContext(ticketId);
    if (!freshTicket) return;

    const fileName = attachment?.originalFileName || "Unknown File";
    const recipients = recipientService.resolveAttachmentRecipients(freshTicket);
    const rendered = templateService.renderAttachmentRemoved(
      freshTicket,
      fileName,
      actor?.name,
    );
    await dispatchToRecipients(recipients, rendered, "ATTACHMENT_REMOVED");
  }, "ATTACHMENT_REMOVED");
};

module.exports = {
  notifyTicketCreated,
  notifyStatusChanged,
  notifyAssigneeAdded,
  notifyAssigneeRemoved,
  notifyPriorityChanged,
  notifyNewRemark,
  notifySubTicketCreated,
  notifyCollaboratingTeamAdded,
  notifyTicketReassigned,
  notifyCollaboratingTeamRemoved,
  notifyAttachmentAdded,
  notifyAttachmentRemoved,
};
