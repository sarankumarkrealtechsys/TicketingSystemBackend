const { env } = require("../../config/env");

/**
 * Resolves color styling tokens for ticket priority matching the web app theme.
 */
const getPriorityColorConfig = (priorityLabel) => {
  const norm = (priorityLabel || "").toUpperCase().trim();
  if (norm.includes("CRIT") || norm.includes("URGENT") || norm.includes("BLOCK") || norm === "P1") {
    return {
      bg: "#FEF2F2",
      text: "#991B1B",
      border: "#FECACA",
      dot: "#EF4444",
    };
  }
  if (norm.includes("HIGH") || norm === "P2") {
    return {
      bg: "#FFF7ED",
      text: "#9A3412",
      border: "#FED7AA",
      dot: "#F97316",
    };
  }
  if (norm.includes("LOW") || norm.includes("MINOR") || norm === "P4") {
    return {
      bg: "#ECFDF5",
      text: "#065F46",
      border: "#A7F3D0",
      dot: "#10B981",
    };
  }
  // Medium / Normal / P3 / Default
  return {
    bg: "#EFF6FF",
    text: "#1E40AF",
    border: "#BFDBFE",
    dot: "#3B82F6",
  };
};

/**
 * Resolves color styling tokens for ticket status matching the web app theme.
 */
const getStatusColorConfig = (statusLabel, behavior) => {
  const b = (behavior || "").toUpperCase().trim();
  const l = (statusLabel || "").toUpperCase().trim();

  if (b === "RESOLVED" || l.includes("RESOLV") || l.includes("SOLV") || l.includes("FIX")) {
    return {
      bg: "#ECFDF5",
      text: "#065F46",
      border: "#A7F3D0",
      dot: "#10B981",
    };
  }
  if (b === "CLOSED" || l.includes("CLOSE") || l.includes("COMPLET")) {
    return {
      bg: "#F1F5F9",
      text: "#334155",
      border: "#CBD5E1",
      dot: "#64748B",
    };
  }
  if (l.includes("CANCEL") || l.includes("REJECT") || l.includes("DELET")) {
    return {
      bg: "#FEF2F2",
      text: "#991B1B",
      border: "#FECACA",
      dot: "#EF4444",
    };
  }
  if (
    b === "ON_HOLD" ||
    l.includes("HOLD") ||
    l.includes("PEND") ||
    l.includes("WAIT") ||
    l.includes("REVIEW") ||
    l.includes("QA")
  ) {
    return {
      bg: "#F5F3FF",
      text: "#5B21B6",
      border: "#DDD6FE",
      dot: "#8B5CF6",
    };
  }
  if (
    b === "IN_PROGRESS" ||
    l.includes("PROGRESS") ||
    l.includes("WORK") ||
    l.includes("ACTIVE")
  ) {
    return {
      bg: "#FFFBEB",
      text: "#92400E",
      border: "#FDE68A",
      dot: "#F59E0B",
    };
  }
  // OPEN / NEW / Default
  return {
    bg: "#EFF6FF",
    text: "#1E40AF",
    border: "#BFDBFE",
    dot: "#3B82F6",
  };
};

/**
 * Generates an inline CSS colored badge HTML for Priority.
 */
const renderPriorityBadgeHtml = (priorityLabel) => {
  const label = priorityLabel || "Normal";
  const { bg, text, border, dot } = getPriorityColorConfig(label);
  return `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: clamp(10px, 1.4vw, 12px); font-weight: 700; background-color: ${bg}; color: ${text}; border: 1px solid ${border}; letter-spacing: 0.3px; vertical-align: middle;"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${dot}; margin-right: 5px; vertical-align: middle;"></span>${label}</span>`;
};

/**
 * Generates an inline CSS colored badge HTML for Status.
 */
const renderStatusBadgeHtml = (statusLabel, behavior) => {
  const label = statusLabel || "Open";
  const { bg, text, border, dot } = getStatusColorConfig(label, behavior);
  return `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: clamp(10px, 1.4vw, 12px); font-weight: 700; background-color: ${bg}; color: ${text}; border: 1px solid ${border}; letter-spacing: 0.3px; vertical-align: middle;"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${dot}; margin-right: 5px; vertical-align: middle;"></span>${label}</span>`;
};

/**
 * Builds responsive, fluid full-width HTML and plaintext email content
 * matching the RTS Help Desk web application design system:
 * - Fluid full available screen width (100% width)
 * - Scalable responsive font sizes based on viewport / screen width
 * - Fonts: Montserrat & Comfortaa (Google Fonts with system fallbacks)
 * - Brand Navy (#1F3864) & Slate accents
 * - Clean information presentation without external links or buttons
 */
const buildEmailContent = ({
  title,
  badgeText,
  badgeBg = "#EFF6FF",
  badgeColor = "#1F3864",
  badgeBorder = "#BFDBFE",
  ticketNumber,
  project,
  team,
  statusLabel,
  statusBehavior,
  actionDescription,
  details = [],
}) => {
  const detailsHtml = details
    .map(
      (d, idx) => `
        <tr>
          <td class="detail-label" style="padding: 10px 14px; font-size: clamp(11px, 1.4vw, 12px); font-weight: 600; color: #64748b; width: 130px; ${
            idx < details.length - 1 ? "border-bottom: 1px solid #edf2f7;" : ""
          } text-transform: uppercase; letter-spacing: 0.3px;">${d.label}</td>
          <td class="detail-value" style="padding: 10px 14px; font-size: clamp(12px, 1.6vw, 14px); color: #0f172a; font-weight: 500; ${
            idx < details.length - 1 ? "border-bottom: 1px solid #edf2f7;" : ""
          }">${d.htmlValue || d.value}</td>
        </tr>`,
    )
    .join("");

  const detailsText = details
    .map((d) => `• ${d.label}: ${d.textValue || d.value}`)
    .join("\n");

  const statusBadge = renderStatusBadgeHtml(statusLabel, statusBehavior);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- Google Fonts: Comfortaa & Montserrat matching website typography -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@500;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      font-family: 'Montserrat', 'Comfortaa', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      width: 100% !important;
    }
    .email-container {
      width: 100% !important;
      max-width: 100% !important;
    }
    @media only screen and (max-width: 480px) {
      .email-card-content { padding: 16px 12px !important; }
      .email-brand-title { font-size: 18px !important; }
      .email-brand-sub { font-size: 10px !important; }
      .email-title { font-size: 18px !important; }
      .email-desc { font-size: 13px !important; }
      .detail-label { width: 95px !important; font-size: 11px !important; padding: 8px 10px !important; }
      .detail-value { font-size: 12px !important; padding: 8px 10px !important; }
    }
    @media only screen and (min-width: 481px) and (max-width: 768px) {
      .email-card-content { padding: 22px 18px !important; }
      .email-brand-title { font-size: 20px !important; }
      .email-brand-sub { font-size: 11px !important; }
      .email-title { font-size: 21px !important; }
      .email-desc { font-size: 14px !important; }
      .detail-label { width: 120px !important; font-size: 12px !important; padding: 10px 12px !important; }
      .detail-value { font-size: 13px !important; padding: 10px 12px !important; }
    }
    @media only screen and (min-width: 769px) {
      .email-card-content { padding: 28px 28px !important; }
      .email-brand-title { font-size: 22px !important; }
      .email-brand-sub { font-size: 11px !important; }
      .email-title { font-size: 24px !important; }
      .email-desc { font-size: 15px !important; }
      .detail-label { width: 140px !important; font-size: 12px !important; padding: 12px 16px !important; }
      .detail-value { font-size: 14px !important; padding: 12px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: clamp(12px, 2.5vw, 24px); background-color: #f8fafc; font-family: 'Montserrat', 'Comfortaa', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; width: 100%;">
  <table class="email-container" role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100% !important; max-width: 100% !important; margin: 0; table-layout: fixed;">
    <!-- Brand Header -->
    <tr>
      <td style="padding: 0 0 16px 4px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div class="email-brand-title" style="font-family: 'Comfortaa', 'Montserrat', sans-serif; font-size: clamp(18px, 2.5vw, 22px); font-weight: 700; color: #1F3864; letter-spacing: -0.5px;">
                RTS <span style="color: #2563EB;">Help Desk</span>
              </div>
              <div class="email-brand-sub" style="font-size: clamp(10px, 1.3vw, 11px); font-weight: 600; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 2px;">
                Enterprise Support System
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Main Card Container -->
    <tr>
      <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
        <!-- Top Navy Accent Stripe -->
        <div style="background-color: #1F3864; height: 5px; width: 100%;"></div>

        <div class="email-card-content" style="padding: clamp(18px, 3.5vw, 28px);">
          <!-- Event Badge & Title -->
          <div style="margin-bottom: 18px;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: clamp(10px, 1.3vw, 11px); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
              ${badgeText}
            </span>
            <h1 class="email-title" style="font-family: 'Comfortaa', 'Montserrat', sans-serif; font-size: clamp(18px, 3vw, 24px); font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
              ${title}
            </h1>
            <p class="email-desc" style="font-size: clamp(13px, 1.8vw, 15px); color: #475569; margin: 0; line-height: 1.5;">
              ${actionDescription}
            </p>
          </div>

          <!-- Structured Ticket Details Grid -->
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 20px 0; width: 100%;">
            <tr>
              <td class="detail-label" style="padding: 10px 14px; font-size: clamp(11px, 1.4vw, 12px); font-weight: 600; color: #64748b; width: 130px; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Ticket</td>
              <td class="detail-value" style="padding: 10px 14px; font-size: clamp(12px, 1.6vw, 14px); font-weight: 700; color: #1F3864; border-bottom: 1px solid #edf2f7;">#${ticketNumber}</td>
            </tr>
            <tr>
              <td class="detail-label" style="padding: 10px 14px; font-size: clamp(11px, 1.4vw, 12px); font-weight: 600; color: #64748b; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Project</td>
              <td class="detail-value" style="padding: 10px 14px; font-size: clamp(12px, 1.6vw, 14px); color: #0f172a; border-bottom: 1px solid #edf2f7;">${project}</td>
            </tr>
            <tr>
              <td class="detail-label" style="padding: 10px 14px; font-size: clamp(11px, 1.4vw, 12px); font-weight: 600; color: #64748b; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Team</td>
              <td class="detail-value" style="padding: 10px 14px; font-size: clamp(12px, 1.6vw, 14px); color: #0f172a; border-bottom: 1px solid #edf2f7;">${team}</td>
            </tr>
            <tr>
              <td class="detail-label" style="padding: 10px 14px; font-size: clamp(11px, 1.4vw, 12px); font-weight: 600; color: #64748b; border-bottom: ${
                details.length > 0 ? "1px solid #edf2f7" : "none"
              }; text-transform: uppercase; letter-spacing: 0.3px;">Status</td>
              <td class="detail-value" style="padding: 10px 14px; font-size: clamp(12px, 1.6vw, 14px); color: #0f172a; border-bottom: ${
                details.length > 0 ? "1px solid #edf2f7" : "none"
              };">
                ${statusBadge}
              </td>
            </tr>
            ${detailsHtml}
          </table>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 8px; text-align: center; font-size: clamp(10px, 1.3vw, 11px); color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 4px 0;">This is an automated operational notification dispatched by RTS Help Desk.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} RTS Help Desk System. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
[RTS Help Desk] ${title}
${actionDescription}

Ticket Number: #${ticketNumber}
Project: ${project}
Team: ${team}
Status: ${statusLabel}
${detailsText ? detailsText + "\n" : ""}
  `.trim();

  return { html, text };
};

/**
 * 1. Ticket Created Email Template (Sent exclusively to the creator)
 */
const renderTicketCreated = (ticket) => {
  const subject = `[RTS Help Desk] Ticket Created: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Open";
  const statusBehavior = ticket.status?.behavior || "OPEN";

  const content = buildEmailContent({
    title: "Ticket Created",
    badgeText: "Created",
    badgeBg: "#EFF6FF",
    badgeColor: "#1F3864",
    badgeBorder: "#BFDBFE",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel,
    statusBehavior,
    actionDescription: `Your ticket #${ticket.ticketNumber} "${ticket.summary}" has been created successfully.`,
    details: [
      {
        label: "Priority",
        value: priorityLabel,
        htmlValue: renderPriorityBadgeHtml(priorityLabel),
      },
      { label: "Created By", value: ticket.createdBy?.name || "You" },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

/**
 * 2. Ticket Assigned to You Email Template (Sent to assignees & leads)
 */
const renderTicketAssigned = (ticket, assigneeName) => {
  const subject = `[RTS Help Desk] Ticket Assigned to You: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Open";
  const statusBehavior = ticket.status?.behavior || "OPEN";

  const content = buildEmailContent({
    title: "Ticket Assigned to You",
    badgeText: "Assigned",
    badgeBg: "#EEF2FF",
    badgeColor: "#4338CA",
    badgeBorder: "#C7D2FE",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel,
    statusBehavior,
    actionDescription: `Ticket #${ticket.ticketNumber} "${ticket.summary}" has been assigned to you.`,
    details: [
      {
        label: "Priority",
        value: priorityLabel,
        htmlValue: renderPriorityBadgeHtml(priorityLabel),
      },
      { label: "Assigned To", value: assigneeName || "You" },
      { label: "Created By", value: ticket.createdBy?.name || "User" },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

/**
 * 3. Ticket Resolved Email Template
 */
const renderTicketResolved = (
  ticket,
  previousStatusLabel,
  newStatusLabel,
  remarks,
) => {
  const subject = `[RTS Help Desk] Ticket Resolved: #${ticket.ticketNumber} - ${ticket.summary}`;
  const prevLabel = previousStatusLabel || "In Progress";
  const currentStatusLabel = newStatusLabel || ticket.status?.label || "Resolved";
  const priorityLabel = ticket.priority?.label || "Normal";

  const details = [
    { label: "Summary", value: ticket.summary },
    {
      label: "Priority",
      value: priorityLabel,
      htmlValue: renderPriorityBadgeHtml(priorityLabel),
    },
    {
      label: "Previous Status",
      value: prevLabel,
      htmlValue: renderStatusBadgeHtml(prevLabel),
    },
    {
      label: "Resolved Status",
      value: currentStatusLabel,
      htmlValue: renderStatusBadgeHtml(currentStatusLabel, "RESOLVED"),
    },
  ];
  if (remarks) {
    details.push({ label: "Resolution Notes", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Marked as Resolved",
    badgeText: "Resolved",
    badgeBg: "#ECFDF5",
    badgeColor: "#047857",
    badgeBorder: "#A7F3D0",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: currentStatusLabel,
    statusBehavior: "RESOLVED",
    actionDescription: `Ticket #${ticket.ticketNumber} has been resolved and is ready for verification.`,
    details,
  });
  return { subject, ...content };
};

/**
 * 4. Ticket Closed Email Template
 */
const renderTicketClosed = (
  ticket,
  previousStatusLabel,
  newStatusLabel,
  remarks,
) => {
  const subject = `[RTS Help Desk] Ticket Closed: #${ticket.ticketNumber} - ${ticket.summary}`;
  const prevLabel = previousStatusLabel || "Resolved";
  const currentStatusLabel = newStatusLabel || ticket.status?.label || "Closed";
  const priorityLabel = ticket.priority?.label || "Normal";

  const details = [
    { label: "Summary", value: ticket.summary },
    {
      label: "Priority",
      value: priorityLabel,
      htmlValue: renderPriorityBadgeHtml(priorityLabel),
    },
    {
      label: "Previous Status",
      value: prevLabel,
      htmlValue: renderStatusBadgeHtml(prevLabel),
    },
    {
      label: "Final Status",
      value: currentStatusLabel,
      htmlValue: renderStatusBadgeHtml(currentStatusLabel, "CLOSED"),
    },
  ];
  if (remarks) {
    details.push({ label: "Closure Notes", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Closed",
    badgeText: "Closed",
    badgeBg: "#F1F5F9",
    badgeColor: "#475569",
    badgeBorder: "#CBD5E1",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: currentStatusLabel,
    statusBehavior: "CLOSED",
    actionDescription: `Ticket #${ticket.ticketNumber} has been finalized and closed.`,
    details,
  });
  return { subject, ...content };
};

/**
 * 5. Ticket Reassigned Email Template
 */
const renderTicketReassigned = (
  ticket,
  newTeamName,
  newAssigneeNames,
  remarks,
) => {
  const subject = `[RTS Help Desk] Ticket Reassigned: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Open";
  const statusBehavior = ticket.status?.behavior || "OPEN";

  const details = [
    { label: "Summary", value: ticket.summary },
    {
      label: "Priority",
      value: priorityLabel,
      htmlValue: renderPriorityBadgeHtml(priorityLabel),
    },
    { label: "New Team", value: newTeamName },
    { label: "New Assignees", value: newAssigneeNames || "Unassigned" },
  ];
  if (remarks) {
    details.push({ label: "Reassignment Notes", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Reassigned",
    badgeText: "Reassigned",
    badgeBg: "#FFFBEB",
    badgeColor: "#B45309",
    badgeBorder: "#FDE68A",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: newTeamName,
    statusLabel,
    statusBehavior,
    actionDescription: `Ticket #${ticket.ticketNumber} has been reassigned to team "${newTeamName}".`,
    details,
  });
  return { subject, ...content };
};

/**
 * 6. Ticket Deleted Email Template
 */
const renderTicketDeleted = (ticket, deletedByName, remarks) => {
  const subject = `[RTS Help Desk] Ticket Deleted: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Closed";
  const statusBehavior = ticket.status?.behavior || "CLOSED";

  const details = [
    { label: "Summary", value: ticket.summary },
    {
      label: "Priority",
      value: priorityLabel,
      htmlValue: renderPriorityBadgeHtml(priorityLabel),
    },
    { label: "Deleted By", value: deletedByName || "System" },
  ];
  if (remarks) {
    details.push({ label: "Deletion Notes", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Deleted",
    badgeText: "Deleted",
    badgeBg: "#FEF2F2",
    badgeColor: "#991B1B",
    badgeBorder: "#FECACA",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel,
    statusBehavior,
    actionDescription: `Ticket #${ticket.ticketNumber} "${ticket.summary}" has been permanently deleted from the system.`,
    details,
  });
  return { subject, ...content };
};

/**
 * 6. Ticket Assignee Removed Email Template
 */
const renderTicketAssigneeRemoved = (ticket, removedUserName, actorName) => {
  const subject = `[RTS Help Desk] Assignment Removed: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Open";
  const statusBehavior = ticket.status?.behavior || "OPEN";

  const content = buildEmailContent({
    title: "Assignment Removed from Ticket",
    badgeText: "Removed",
    badgeBg: "#FEF2F2",
    badgeColor: "#991B1B",
    badgeBorder: "#FECACA",
    ticketNumber: ticket.ticketNumber,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel,
    statusBehavior,
    actionDescription: `You have been unassigned from ticket #${ticket.ticketNumber} "${ticket.summary}" by ${actorName || "a team member"}.`,
    details: [
      {
        label: "Priority",
        value: priorityLabel,
        htmlValue: renderPriorityBadgeHtml(priorityLabel),
      },
      { label: "Unassigned Engineer", value: removedUserName || "You" },
      { label: "Action By", value: actorName || "Team Member" },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

module.exports = {
  getPriorityColorConfig,
  getStatusColorConfig,
  renderPriorityBadgeHtml,
  renderStatusBadgeHtml,
  renderTicketCreated,
  renderTicketAssigned,
  renderTicketAssigneeRemoved,
  renderTicketResolved,
  renderTicketClosed,
  renderTicketReassigned,
  renderTicketDeleted,
};



