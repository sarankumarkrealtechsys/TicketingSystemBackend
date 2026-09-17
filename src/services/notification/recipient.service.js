const { prisma } = require("../../lib/prisma");
const { env } = require("../../config/env");

/**
 * Normalizes email addresses and deduplicates recipients by email address.
 * Ensures that one person qualifying through multiple roles receives at most one email per event.
 */
const deduplicateRecipients = (recipients) => {
  const map = new Map();
  for (const r of recipients) {
    if (!r || !r.email || typeof r.email !== "string") continue;
    const normalized = r.email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) continue;

    if (!map.has(normalized)) {
      map.set(normalized, {
        email: normalized,
        name: r.name || "",
        userId: r.userId || null,
        roles: r.role ? [r.role] : [],
      });
    } else {
      const existing = map.get(normalized);
      if (r.role && !existing.roles.includes(r.role)) {
        existing.roles.push(r.role);
      }
      if (!existing.name && r.name) existing.name = r.name;
      if (!existing.userId && r.userId) existing.userId = r.userId;
    }
  }
  return Array.from(map.values());
};

/**
 * Queries current PostgreSQL state for complete ticket context.
 */
const fetchTicketNotificationContext = async (ticketId) => {
  return await prisma.ticket.findUnique({
    where: { id: Number(ticketId) },
    include: {
      project: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, teamAdminEmail: true } },
      priority: { select: { id: true, label: true } },
      status: { select: { id: true, label: true, behavior: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      assignees: {
        where: { removedAt: null },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      collaboratingTeams: {
        where: { removedAt: null },
        include: { team: { select: { id: true, name: true, teamAdminEmail: true } } },
      },
    },
  });
};

/**
 * Extracts standard base recipients: Creator, active Assignees, and Primary Team Lead.
 */
const collectBaseTicketRecipients = (ticket) => {
  const list = [];
  if (ticket.createdBy?.email) {
    list.push({
      email: ticket.createdBy.email,
      name: ticket.createdBy.name,
      userId: ticket.createdBy.id,
      role: "Creator",
    });
  }
  if (Array.isArray(ticket.assignees)) {
    for (const a of ticket.assignees) {
      if (a.user?.email) {
        list.push({
          email: a.user.email,
          name: a.user.name,
          userId: a.user.id,
          role: "Assignee",
        });
      }
    }
  }
  if (ticket.team?.teamAdminEmail) {
    list.push({
      email: ticket.team.teamAdminEmail,
      name: `${ticket.team.name} Lead`,
      role: "Primary Team Lead",
    });
  }
  return list;
};

/**
 * Extracts collaborating team leads.
 */
const collectCollabTeamLeads = (ticket) => {
  const list = [];
  if (Array.isArray(ticket.collaboratingTeams)) {
    for (const ct of ticket.collaboratingTeams) {
      if (ct.team?.teamAdminEmail) {
        list.push({
          email: ct.team.teamAdminEmail,
          name: `${ct.team.name} Lead`,
          role: "Collaborating Team Lead",
        });
      }
    }
  }
  return list;
};

const resolveTicketCreatedRecipients = (ticket) => {
  const recipients = collectBaseTicketRecipients(ticket);
  recipients.push(...collectCollabTeamLeads(ticket));

  if (
    env.ADMIN_NOTIFICATION_EMAIL &&
    ticket.priority?.label &&
    /high|critical|urgent/i.test(ticket.priority.label)
  ) {
    recipients.push({
      email: env.ADMIN_NOTIFICATION_EMAIL,
      name: "System Admin",
      role: "Admin",
    });
  }

  return deduplicateRecipients(recipients);
};

const resolveStatusChangedRecipients = (ticket) => {
  const recipients = collectBaseTicketRecipients(ticket);
  recipients.push(...collectCollabTeamLeads(ticket));
  return deduplicateRecipients(recipients);
};

const resolveAssigneeAddedRecipients = (assigneeUser) => {
  if (!assigneeUser?.email) return [];
  return deduplicateRecipients([
    {
      email: assigneeUser.email,
      name: assigneeUser.name || "Assignee",
      userId: assigneeUser.id,
      role: "Assignee",
    },
  ]);
};

const resolveAssigneeRemovedRecipients = (removedUser) => {
  if (!removedUser?.email) return [];
  return deduplicateRecipients([
    {
      email: removedUser.email,
      name: removedUser.name || "Assignee",
      userId: removedUser.id,
      role: "Assignee",
    },
  ]);
};

const resolvePriorityChangedRecipients = (ticket) => {
  const recipients = collectBaseTicketRecipients(ticket);
  if (
    env.ADMIN_NOTIFICATION_EMAIL &&
    ticket.priority?.label &&
    /high|critical|urgent/i.test(ticket.priority.label)
  ) {
    recipients.push({
      email: env.ADMIN_NOTIFICATION_EMAIL,
      name: "System Admin",
      role: "Admin",
    });
  }
  return deduplicateRecipients(recipients);
};

const resolveNewRemarkRecipients = (ticket) => {
  return deduplicateRecipients(collectBaseTicketRecipients(ticket));
};

const resolveSubTicketCreatedRecipients = (subTicket, parentTicket) => {
  const recipients = collectBaseTicketRecipients(subTicket);

  if (parentTicket) {
    if (parentTicket.createdBy?.email) {
      recipients.push({
        email: parentTicket.createdBy.email,
        name: parentTicket.createdBy.name,
        userId: parentTicket.createdBy.id,
        role: "Parent Ticket Creator",
      });
    }
    if (Array.isArray(parentTicket.assignees)) {
      for (const a of parentTicket.assignees) {
        if (a.user?.email) {
          recipients.push({
            email: a.user.email,
            name: a.user.name,
            userId: a.user.id,
            role: "Parent Ticket Assignee",
          });
        }
      }
    }
  }

  return deduplicateRecipients(recipients);
};

const resolveCollaboratingTeamAddedRecipients = (collabTeam) => {
  const list = [];
  if (
    collabTeam?.teamAdminEmail &&
    typeof collabTeam.teamAdminEmail === "string"
  ) {
    const email = collabTeam.teamAdminEmail.trim();
    if (email) {
      list.push({
        email,
        name: `${collabTeam.name || "Collaborating Team"} Lead`,
        role: "Collaborating Team Lead",
      });
    }
  }
  return deduplicateRecipients(list);
};

/**
 * Resolves recipients for ticket reassignment.
 * Notifies all active assignees (new and previous), creator, and team leads.
 */
const resolveReassignmentRecipients = (ticket) => {
  const recipients = collectBaseTicketRecipients(ticket);
  recipients.push(...collectCollabTeamLeads(ticket));
  return deduplicateRecipients(recipients);
};

/**
 * Resolves recipients for collaborating team removal.
 * Notifies the removed team's admin email.
 */
const resolveCollaboratingTeamRemovedRecipients = (collabTeam) => {
  const list = [];
  if (
    collabTeam?.teamAdminEmail &&
    typeof collabTeam.teamAdminEmail === "string"
  ) {
    const email = collabTeam.teamAdminEmail.trim();
    if (email) {
      list.push({
        email,
        name: `${collabTeam.name || "Team"} Lead`,
        role: "Removed Collaborating Team Lead",
      });
    }
  }
  return deduplicateRecipients(list);
};

/**
 * Resolves recipients for attachment events.
 * Notifies creator, active assignees, and team leads.
 */
const resolveAttachmentRecipients = (ticket) => {
  return deduplicateRecipients(collectBaseTicketRecipients(ticket));
};

module.exports = {
  deduplicateRecipients,
  fetchTicketNotificationContext,
  resolveTicketCreatedRecipients,
  resolveStatusChangedRecipients,
  resolveAssigneeAddedRecipients,
  resolveAssigneeRemovedRecipients,
  resolvePriorityChangedRecipients,
  resolveNewRemarkRecipients,
  resolveSubTicketCreatedRecipients,
  resolveCollaboratingTeamAddedRecipients,
  resolveReassignmentRecipients,
  resolveCollaboratingTeamRemovedRecipients,
  resolveAttachmentRecipients,
};
