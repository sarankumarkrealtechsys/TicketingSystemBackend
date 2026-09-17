const { env } = require("../../config/env");

const getTicketUrl = (ticketId) => `${env.FRONTEND_URL}/tickets/${ticketId}`;

const buildEmailContent = ({
  title,
  ticketNumber,
  ticketId,
  project,
  team,
  statusLabel,
  actionDescription,
  details = [],
}) => {
  const directLink = getTicketUrl(ticketId);
  const detailsHtml = details
    .map(
      (d) =>
        `<tr><td style="padding: 6px 10px; font-weight: bold; color: #555; width: 140px;">${d.label}:</td><td style="padding: 6px 10px; color: #111;">${d.value}</td></tr>`,
    )
    .join("");

  const detailsText = details
    .map((d) => `• ${d.label}: ${d.value}`)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f7f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e1e4e8; padding: 24px;">
    <h2 style="color: #0f172a; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; font-size: 20px;">${title}</h2>
    <p style="font-size: 15px; margin-bottom: 16px;">${actionDescription}</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 6px;">
      <tr><td style="padding: 6px 10px; font-weight: bold; color: #555; width: 140px;">Ticket Number:</td><td style="padding: 6px 10px; font-weight: bold; color: #0284c7;">${ticketNumber}</td></tr>
      <tr><td style="padding: 6px 10px; font-weight: bold; color: #555;">Project:</td><td style="padding: 6px 10px;">${project}</td></tr>
      <tr><td style="padding: 6px 10px; font-weight: bold; color: #555;">Team:</td><td style="padding: 6px 10px;">${team}</td></tr>
      <tr><td style="padding: 6px 10px; font-weight: bold; color: #555;">Status:</td><td style="padding: 6px 10px;"><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-weight: bold; font-size: 13px;">${statusLabel}</span></td></tr>
      ${detailsHtml}
    </table>
    <div style="margin-top: 24px; text-align: center;">
      <a href="${directLink}" style="display: inline-block; padding: 10px 24px; background-color: #0284c7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">View Ticket</a>
    </div>
    <p style="margin-top: 24px; font-size: 12px; color: #64748b; text-align: center;">Direct Link: <a href="${directLink}">${directLink}</a></p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${title}
${actionDescription}

Ticket Number: ${ticketNumber}
Project: ${project}
Team: ${team}
Status: ${statusLabel}
${detailsText ? detailsText + "\n" : ""}
Direct Link: ${directLink}
  `.trim();

  return { html, text };
};

const renderTicketCreated = (ticket) => {
  const subject = `[RTS Help Desk] Ticket Created: ${ticket.ticketNumber} - ${ticket.summary}`;
  const content = buildEmailContent({
    title: "Ticket Created",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Open",
    actionDescription: `Ticket "${ticket.summary}" has been successfully created.`,
    details: [
      { label: "Priority", value: ticket.priority?.label || "Normal" },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

const renderStatusChanged = (ticket, previousStatusLabel, newStatusLabel, remarks) => {
  const subject = `[RTS Help Desk] Ticket ${ticket.ticketNumber} Status Changed: ${newStatusLabel}`;
  const details = [
    { label: "Previous Status", value: previousStatusLabel || "N/A" },
    { label: "New Status", value: newStatusLabel },
  ];
  if (remarks) {
    details.push({ label: "Remarks", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Status Changed",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: newStatusLabel,
    actionDescription: `The status of ticket ${ticket.ticketNumber} has been updated to "${newStatusLabel}".`,
    details,
  });
  return { subject, ...content };
};

const renderAssigneeAdded = (ticket, assigneeName) => {
  const subject = `[RTS Help Desk] You were assigned to Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Assignee Added",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `Hello ${assigneeName || "Assignee"}, you have been assigned to work on ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "Summary", value: ticket.summary },
      { label: "Priority", value: ticket.priority?.label || "Normal" },
    ],
  });
  return { subject, ...content };
};

const renderAssigneeRemoved = (ticket, removedName) => {
  const subject = `[RTS Help Desk] Assignment Removed: Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Assignee Removed",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `Hello ${removedName || "Assignee"}, you have been unassigned from ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

const renderPriorityChanged = (ticket, previousPriorityLabel, newPriorityLabel, remarks) => {
  const subject = `[RTS Help Desk] Ticket ${ticket.ticketNumber} Priority Changed: ${newPriorityLabel}`;
  const details = [
    { label: "Previous Priority", value: previousPriorityLabel || "N/A" },
    { label: "New Priority", value: newPriorityLabel },
  ];
  if (remarks) {
    details.push({ label: "Remarks", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Priority Changed",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `The priority of ticket ${ticket.ticketNumber} has been changed to "${newPriorityLabel}".`,
    details,
  });
  return { subject, ...content };
};

const renderNewRemark = (ticket, remarkText, actorName) => {
  const subject = `[RTS Help Desk] New Remark on Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "New Remark Added",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `${actorName || "A team member"} added a new remark to ticket ${ticket.ticketNumber}:`,
    details: [
      { label: "Remark", value: remarkText },
    ],
  });
  return { subject, ...content };
};

const renderSubTicketCreated = (subTicket, parentTicket) => {
  const subject = `[RTS Help Desk] Sub-Ticket Created: ${subTicket.ticketNumber} (Parent: ${parentTicket?.ticketNumber || "N/A"})`;
  const content = buildEmailContent({
    title: "Sub-Ticket Created",
    ticketNumber: subTicket.ticketNumber,
    ticketId: subTicket.id,
    project: subTicket.project?.name || "Unknown Project",
    team: subTicket.team?.name || "Unknown Team",
    statusLabel: subTicket.status?.label || "Open",
    actionDescription: `A new sub-ticket ${subTicket.ticketNumber} has been created under parent ticket ${parentTicket?.ticketNumber || ""}.`,
    details: [
      { label: "Parent Ticket", value: parentTicket?.ticketNumber || "N/A" },
      { label: "Summary", value: subTicket.summary },
      { label: "Priority", value: subTicket.priority?.label || "Normal" },
    ],
  });
  return { subject, ...content };
};

const renderCollaboratingTeamAdded = (ticket, collaboratingTeamName) => {
  const subject = `[RTS Help Desk] Collaborating Team Added: Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Collaborating Team Added",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `Team "${collaboratingTeamName}" has been added as a collaborating team on ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "Collaborating Team", value: collaboratingTeamName },
      { label: "Summary", value: ticket.summary },
      { label: "Priority", value: ticket.priority?.label || "Normal" },
    ],
  });
  return { subject, ...content };
};

const renderTicketReassigned = (ticket, newTeamName, newAssigneeNames, remarks) => {
  const subject = `[RTS Help Desk] Ticket ${ticket.ticketNumber} Reassigned`;
  const details = [
    { label: "Summary", value: ticket.summary },
    { label: "New Team", value: newTeamName },
    { label: "New Assignees", value: newAssigneeNames || "N/A" },
  ];
  if (remarks) {
    details.push({ label: "Remarks", value: remarks });
  }

  const content = buildEmailContent({
    title: "Ticket Reassigned",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: newTeamName,
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `Ticket ${ticket.ticketNumber} has been reassigned to team "${newTeamName}".`,
    details,
  });
  return { subject, ...content };
};

const renderCollaboratingTeamRemoved = (ticket, removedTeamName) => {
  const subject = `[RTS Help Desk] Collaborating Team Removed: Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Collaborating Team Removed",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `Team "${removedTeamName}" has been removed as a collaborating team from ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "Removed Team", value: removedTeamName },
      { label: "Summary", value: ticket.summary },
    ],
  });
  return { subject, ...content };
};

const renderAttachmentAdded = (ticket, fileName, actorName) => {
  const subject = `[RTS Help Desk] Attachment Added: Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Attachment Added",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `${actorName || "A team member"} uploaded a new attachment to ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "File Name", value: fileName },
    ],
  });
  return { subject, ...content };
};

const renderAttachmentRemoved = (ticket, fileName, actorName) => {
  const subject = `[RTS Help Desk] Attachment Removed: Ticket ${ticket.ticketNumber}`;
  const content = buildEmailContent({
    title: "Attachment Removed",
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.id,
    project: ticket.project?.name || "Unknown Project",
    team: ticket.team?.name || "Unknown Team",
    statusLabel: ticket.status?.label || "Unknown",
    actionDescription: `${actorName || "A team member"} removed an attachment from ticket ${ticket.ticketNumber}.`,
    details: [
      { label: "File Name", value: fileName },
    ],
  });
  return { subject, ...content };
};

module.exports = {
  renderTicketCreated,
  renderStatusChanged,
  renderAssigneeAdded,
  renderAssigneeRemoved,
  renderPriorityChanged,
  renderNewRemark,
  renderSubTicketCreated,
  renderCollaboratingTeamAdded,
  renderTicketReassigned,
  renderCollaboratingTeamRemoved,
  renderAttachmentAdded,
  renderAttachmentRemoved,
};
