const { prisma } = require("../../lib/prisma");

/**
 * Exact Allowed Scopes Map for all 39 System Permissions
 * Derived directly from BRD Section 3.5 and seed.js definitions:
 * - Every key in ADMIN_PERMISSIONS supports GLOBAL.
 * - The 19 keys in USER_PERMISSIONS also support their specifically assigned scoped access.
 * - All other 20 keys support only GLOBAL.
 */
const PERMISSION_ALLOWED_SCOPES = {
  // ── 19 Permissions supporting Scoped Access (from USER_PERMISSIONS) ──
  USER_VIEW: ["GLOBAL", "OWN"],
  USER_UPDATE: ["GLOBAL", "OWN"],
  DEPARTMENT_VIEW: ["GLOBAL", "OWN"],
  TEAM_VIEW: ["GLOBAL", "TEAM"],
  PROJECT_VIEW: ["GLOBAL", "TEAM"],
  STATUS_CREATE: ["GLOBAL", "TEAM"],
  TICKET_CREATE: ["GLOBAL", "TEAM"],
  TICKET_VIEW: ["GLOBAL", "TEAM"],
  TICKET_UPDATE: ["GLOBAL", "ASSIGNED"],
  TICKET_CHANGE_STATUS: ["GLOBAL", "ASSIGNED"],
  TICKET_CHANGE_PRIORITY: ["GLOBAL", "ASSIGNED"],
  TICKET_CREATE_SUBTICKET: ["GLOBAL", "OWN", "ASSIGNED"],
  TICKET_CLOSE: ["GLOBAL", "ASSIGNED"],
  TICKET_ADD_REMARK: ["GLOBAL", "ASSIGNED"],
  TICKET_ATTACHMENT_MANAGE: ["GLOBAL", "ASSIGNED"],
  TICKET_LOG_TIME: ["GLOBAL", "OWN"],
  TICKET_HISTORY_VIEW: ["GLOBAL", "TEAM"],
  DASHBOARD_VIEW: ["GLOBAL", "OWN"],
  TICKET_ASSIGN: ["GLOBAL", "OWN"],

  // ── 20 Admin / Global-Only Permissions (not granted to User role) ──
  USER_CREATE: ["GLOBAL"],
  USER_DELETE: ["GLOBAL"],
  DEPARTMENT_CREATE: ["GLOBAL"],
  DEPARTMENT_UPDATE: ["GLOBAL"],
  DEPARTMENT_DELETE: ["GLOBAL"],
  TEAM_CREATE: ["GLOBAL"],
  TEAM_UPDATE: ["GLOBAL"],
  TEAM_DELETE: ["GLOBAL"],
  PROJECT_CREATE: ["GLOBAL"],
  PROJECT_UPDATE: ["GLOBAL"],
  PROJECT_DELETE: ["GLOBAL"],
  PRIORITY_MANAGE: ["GLOBAL"],
  STATUS_UPDATE: ["GLOBAL"],
  STATUS_RETIRE: ["GLOBAL"],
  TICKET_FIELD_MANAGE: ["GLOBAL"],
  TEAM_MEMBERSHIP_MANAGE: ["GLOBAL"],
  TICKET_REASSIGN: ["GLOBAL"],
  TICKET_TEAM_MANAGE: ["GLOBAL"],
  USER_PERFORMANCE_VIEW: ["GLOBAL"],
  ROLE_MANAGE: ["GLOBAL"],
};

/**
 * Validates whether a given scope is permitted for a specific permission key.
 *
 * @param {string} permissionKey
 * @param {string} scope
 * @returns {boolean}
 */
const validateScopeForPermission = (permissionKey, scope) => {
  const allowedScopes = PERMISSION_ALLOWED_SCOPES[permissionKey];
  if (!allowedScopes) {
    return false;
  }
  return allowedScopes.includes(scope);
};

/**
 * Validates that a Role holds at least one permission before it can be assigned to a User.
 * (Empty Role = no access).
 *
 * @param {number} roleId
 * @returns {Promise<boolean>}
 */
const validateRoleAssignable = async (roleId) => {
  if (!roleId || typeof roleId !== "number") {
    return false;
  }

  const count = await prisma.rolePermission.count({
    where: { roleId },
  });

  return count > 0;
};

module.exports = {
  PERMISSION_ALLOWED_SCOPES,
  validateScopeForPermission,
  validateRoleAssignable,
};
