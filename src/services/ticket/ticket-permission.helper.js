/**
 * Shared Ticket Permission & Actions Helper
 * 
 * Provides unified predicates and action evaluation for tickets.
 * Ensures route resolvers and composite Details response actions object
 * derive from identical RBAC rules with zero drift.
 */

/**
 * Checks whether user is the creator of the ticket (or creator of parent ticket for sub-tickets).
 */
const isTicketCreator = (ticket, user) => {
  if (!ticket || !user) return false;
  const isDirectCreator = Number(ticket.createdById) === Number(user.id);
  const isParentCreator =
    ticket.parentTicket &&
    Number(ticket.parentTicket.createdById) === Number(user.id);
  return isDirectCreator || Boolean(isParentCreator);
};

/**
 * Checks whether user is an active assignee on the ticket.
 */
const isActiveAssignee = (ticket, user) => {
  if (!ticket || !user || !ticket.assignees) return false;
  return ticket.assignees.some(
    (a) => Number(a.userId) === Number(user.id) && (a.removedAt === null || a.removedAt === undefined),
  );
};

/**
 * Checks whether user is either creator or an active assignee.
 */
const isCreatorOrAssignee = (ticket, user) => {
  return isTicketCreator(ticket, user) || isActiveAssignee(ticket, user);
};

/**
 * Computes permission-gated action flags for a ticket and requesting user.
 * Evaluates the 11 Phase 13 workspace actions.
 *
 * @param {Object} ticket Fully populated ticket object including status, createdById, assignees.
 * @param {Object} user Requesting user.
 * @param {Object} userPermissions Permissions map returned by getPermissions(user).
 * @returns {Object} 11 boolean flags for permitted actions.
 */
const computeTicketActions = (ticket, user, userPermissions = {}) => {
  if (!ticket || !user) {
    return {
      addAssignee: false,
      removeAssignee: false,
      reassign: false,
      changePriority: false,
      changeStatus: false,
      createSubticket: false,
      logTime: false,
      addAttachment: false,
      removeAttachment: false,
      close: false,
      addRemark: false,
      manageTeams: false,
    };
  }

  const isCreator = isTicketCreator(ticket, user);
  const isAssignee = isActiveAssignee(ticket, user);

  const hasScope = (key, scope) => Boolean(userPermissions[key]?.includes(scope));
  const hasGlobal = (key) => hasScope(key, "GLOBAL");
  const hasOwn = (key) => hasScope(key, "OWN");
  const hasAssigned = (key) => hasScope(key, "ASSIGNED");

  const isClosed = ticket.status?.behavior === "CLOSED";
  const isResolved = ticket.status?.behavior === "RESOLVED";

  return {
    addAssignee: hasGlobal("TICKET_ASSIGN") || (hasOwn("TICKET_ASSIGN") && isCreator),
    removeAssignee: hasGlobal("TICKET_ASSIGN") || (hasOwn("TICKET_ASSIGN") && isCreator),
    reassign:
      hasGlobal("TICKET_REASSIGN") ||
      (hasOwn("TICKET_REASSIGN") && isCreator),
    changePriority:
      hasGlobal("TICKET_CHANGE_PRIORITY") ||
      (hasAssigned("TICKET_CHANGE_PRIORITY") && isAssignee),
    changeStatus:
      hasGlobal("TICKET_CHANGE_STATUS") ||
      (hasAssigned("TICKET_CHANGE_STATUS") && isAssignee),
    createSubticket:
      hasGlobal("TICKET_CREATE_SUBTICKET") ||
      (hasOwn("TICKET_CREATE_SUBTICKET") && isCreator) ||
      (hasAssigned("TICKET_CREATE_SUBTICKET") && isAssignee),
    logTime: hasGlobal("TICKET_LOG_TIME") || (hasOwn("TICKET_LOG_TIME") && isAssignee),
    addAttachment:
      hasGlobal("TICKET_ATTACHMENT_MANAGE") ||
      (hasOwn("TICKET_ATTACHMENT_MANAGE") && isCreator) ||
      (hasAssigned("TICKET_ATTACHMENT_MANAGE") && isAssignee),
    removeAttachment:
      hasGlobal("TICKET_ATTACHMENT_MANAGE") ||
      (hasOwn("TICKET_ATTACHMENT_MANAGE") && isCreator) ||
      (hasAssigned("TICKET_ATTACHMENT_MANAGE") && isAssignee),
    // Standard user can only close if they are an active assignee AND ticket status is RESOLVED.
    // Admin can close any ticket that is not already CLOSED.
    close:
      (hasGlobal("TICKET_CLOSE") && !isClosed) ||
      (hasAssigned("TICKET_CLOSE") && isAssignee && isResolved),
    addRemark:
      hasGlobal("TICKET_ADD_REMARK") ||
      (hasOwn("TICKET_ADD_REMARK") && isCreator) ||
      (hasAssigned("TICKET_ADD_REMARK") && isAssignee),
    manageTeams: hasGlobal("TICKET_TEAM_MANAGE"),
  };
};

module.exports = {
  isTicketCreator,
  isActiveAssignee,
  isCreatorOrAssignee,
  computeTicketActions,
};
