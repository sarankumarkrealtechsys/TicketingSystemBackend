const { prisma } = require("../../lib/prisma");

/**
 * Permission Resolution Service
 * Given a user object (with roleId), resolves their full set of permissions and granted scopes.
 * Implements per-request caching so subsequent calls within the same request lifecycle
 * do not hit the database multiple times.
 *
 * Output shape:
 * {
 *   TICKET_VIEW: ['TEAM'],
 *   TICKET_UPDATE: ['ASSIGNED'],
 *   USER_CREATE: ['GLOBAL'],
 *   ...
 * }
 *
 * @param {Object} user - Authenticated user object containing roleId
 * @param {Object} [req] - Express request object for attaching per-request cache
 * @returns {Promise<Record<string, string[]>>}
 */
const getPermissions = async (user, req = null) => {
  if (!user || !user.roleId) {
    return {};
  }

  // Check request-level cache
  if (req && req._permissionsCache) {
    return req._permissionsCache;
  }

  // Query RolePermission joined with Permission for this user's roleId
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: user.roleId },
    include: {
      permission: {
        select: { key: true },
      },
    },
  });

  const permissionsMap = {};

  for (const rp of rolePermissions) {
    const key = rp.permission?.key;
    if (!key) continue;

    if (!permissionsMap[key]) {
      permissionsMap[key] = [];
    }

    const scope = rp.scope || "GLOBAL";
    if (!permissionsMap[key].includes(scope)) {
      permissionsMap[key].push(scope);
    }
  }

  // Cache on req for request lifespan
  if (req) {
    req._permissionsCache = permissionsMap;
  }

  return permissionsMap;
};

module.exports = {
  getPermissions,
};
