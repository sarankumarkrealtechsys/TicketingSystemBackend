const { env } = require("../../config/env");

const getTicketUrl = (ticketId) => `${env.FRONTEND_URL}/tickets/${ticketId}`;

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
  if (l.includes("CANCEL") || l.includes("REJECT")) {
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
  return `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; background-color: ${bg}; color: ${text}; border: 1px solid ${border}; letter-spacing: 0.3px; vertical-align: middle;"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${dot}; margin-right: 5px; vertical-align: middle;"></span>${label}</span>`;
};

/**
 * Generates an inline CSS colored badge HTML for Status.
 */
const renderStatusBadgeHtml = (statusLabel, behavior) => {
  const label = statusLabel || "Open";
  const { bg, text, border, dot } = getStatusColorConfig(label, behavior);
  return `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; background-color: ${bg}; color: ${text}; border: 1px solid ${border}; letter-spacing: 0.3px; vertical-align: middle;"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${dot}; margin-right: 5px; vertical-align: middle;"></span>${label}</span>`;
};

/**
 * Builds responsive, beautifully structured HTML and plaintext email content
 * matching the RTS Help Desk web application design system:
 * - Fonts: Montserrat & Comfortaa (Google Fonts with system fallbacks)
 * - Brand Navy (#1F3864) & slate color accents
 * - Card styling matching app cards (#FFFFFF, #E2E8F0 borders, 16px radius)
 * - Semantic badge colors for lifecycle events, status, and priority
 */
const buildEmailContent = ({
  title,
  badgeText,
  badgeBg = "#EFF6FF",
  badgeColor = "#1F3864",
  badgeBorder = "#BFDBFE",
  ticketNumber,
  ticketId,
  project,
  team,
  statusLabel,
  statusBehavior,
  actionDescription,
  details = [],
}) => {
  const directLink = getTicketUrl(ticketId);

  const detailsHtml = details
    .map(
      (d, idx) => `
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; width: 130px; ${
            idx < details.length - 1 ? "border-bottom: 1px solid #edf2f7;" : ""
          } text-transform: uppercase; letter-spacing: 0.3px;">${d.label}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; font-weight: 500; ${
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
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: 'Montserrat', 'Comfortaa', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto;">
    <!-- Brand Header -->
    <tr>
      <td style="padding: 0 0 16px 4px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div style="font-family: 'Comfortaa', 'Montserrat', sans-serif; font-size: 20px; font-weight: 700; color: #1F3864; letter-spacing: -0.5px;">
                RTS <span style="color: #2563EB;">Help Desk</span>
              </div>
              <div style="font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 2px;">
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

        <div style="padding: 28px 28px 24px 28px;">
          <!-- Event Badge & Title -->
          <div style="margin-bottom: 18px;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
              ${badgeText}
            </span>
            <h1 style="font-family: 'Comfortaa', 'Montserrat', sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
              ${title}
            </h1>
            <p style="font-size: 14px; color: #475569; margin: 0; line-height: 1.5;">
              ${actionDescription}
            </p>
          </div>

          <!-- Structured Ticket Details Grid -->
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 20px 0;">
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; width: 130px; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Ticket</td>
              <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #1F3864; border-bottom: 1px solid #edf2f7;">#${ticketNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Project</td>
              <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #edf2f7;">${project}</td>
            </tr>
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 1px solid #edf2f7; text-transform: uppercase; letter-spacing: 0.3px;">Team</td>
              <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #edf2f7;">${team}</td>
            </tr>
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: ${
                details.length > 0 ? "1px solid #edf2f7" : "none"
              }; text-transform: uppercase; letter-spacing: 0.3px;">Status</td>
              <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; border-bottom: ${
                details.length > 0 ? "1px solid #edf2f7" : "none"
              };">
                ${statusBadge}
              </td>
            </tr>
            ${detailsHtml}
          </table>

          <!-- Primary CTA Button -->
          <div style="margin: 28px 0 14px 0; text-align: center;">
            <a href="${directLink}" style="display: inline-block; padding: 12px 28px; background-color: #1F3864; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.2px; box-shadow: 0 2px 4px rgba(31, 56, 100, 0.2);">
              View Ticket in Help Desk &rarr;
            </a>
          </div>

          <!-- Fallback Direct URL -->
          <p style="margin: 16px 0 0 0; font-size: 11px; color: #94a3b8; text-align: center; word-break: break-all;">
            Direct link: <a href="${directLink}" style="color: #2563EB; text-decoration: underline;">${directLink}</a>
          </p>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 8px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
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
Direct Link: ${directLink}
  `.trim();

  return { html, text };
};

/**
 * 1. Ticket Created Email Template
 */
const renderTicketCreated = (ticket) => {
  const subject = `[RTS Help Desk] Ticket Created: #${ticket.ticketNumber} - ${ticket.summary}`;
  const priorityLabel = ticket.priority?.label || "Normal";
  const statusLabel = ticket.status?.label || "Open";
  const statusBehavior = ticket.status?.behavior || "OPEN";

  const content = buildEmailContent({
    title: "New Ticket Created",
    badgeText: "Created",
    badgeBg: "#EFF6FF",
    badgeColor: "#1F3864",
    badgeBorder: "#BFDBFE",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel,
    statusBehavior,
    actionDescription: `Ticket #${ticket.ticketNumber} "${ticket.summary}" has been created.`,
    details: [
      {
        label: "Priority",
        value: priorityLabel,
        htmlValue: renderPriorityBadgeHtml(priorityLabel),
      },
      { label: "Created By", value: ticket.createdBy?.name || "User" },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

/**
 * 2. Ticket Resolved Email Template
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
    ticketId: ticket.id,
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
 * 3. Ticket Closed Email Template
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
    ticketId: ticket.id,
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
 * 4. Ticket Reassigned Email Template
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
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: newTeamName,
    statusLabel,
    statusBehavior,
    actionDescription: `Ticket #${ticket.ticketNumber} has been reassigned to team "${newTeamName}".`,
    details,
  });
  return { subject, ...content };
};

module.exports = {
  getPriorityColorConfig,
  getStatusColorConfig,
  renderPriorityBadgeHtml,
  renderStatusBadgeHtml,
  renderTicketCreated,
  renderTicketResolved,
  renderTicketClosed,
  renderTicketReassigned,
};

