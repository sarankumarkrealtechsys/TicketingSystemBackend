const { prisma } = require("../lib/prisma");
const { getPermissions } = require("../services/auth/permission.service");

/**
 * RBAC Authorization Middleware Factory
 * Reusable gate for protecting endpoints based on granular permissions and scopes.
 *
 * Evaluation Pipeline:
 * 1. Resolves permissions for req.user (using per-request cache).
 * 2. Step 1: Does the user's role hold the required permission key at all?
 *    - If NO → Denied (403). Log to AuditLog (who, required key, when).
 * 3. Step 2: Does the user have GLOBAL scope for this permission?
 *    - If YES → Allowed immediately (proceed to next).
 * 4. Step 3: If only non-GLOBAL scopes are granted:
 *    - Evaluate scopeResolverFn(req.user, targetResource, req).
 *    - If it returns true → Allowed.
 *    - If it returns false (or no resolver provided) → Denied (403).
 *      Log to AuditLog (who, required key, attempted scopes, when).
 *
 * @param {string} key - Permission key (e.g. 'TICKET_CREATE', 'USER_VIEW')
 * @param {Function} [scopeResolverFn] - Optional resolver (user, resource, req) => Promise<boolean>|boolean
 * @returns {Function} Express middleware handler
 */
const requirePermission = (key, scopeResolverFn = null) => {
  const keys = Array.isArray(key) ? key : [key];

  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized: Authentication required",
        });
      }

      // Resolve full permission map for user's role (request-cached)
      const userPermissions = await getPermissions(req.user, req);

      // Collect all granted scopes across any of the accepted permission keys
      const allGrantedScopes = [];
      for (const k of keys) {
        if (userPermissions[k]) {
          allGrantedScopes.push(...userPermissions[k]);
        }
      }

      // ── Step 1: Check if the user's role holds the required permission at all ─
      if (allGrantedScopes.length === 0) {
        // Log denial to AuditLog
        await prisma.auditLog.create({
          data: {
            entityType: "PERMISSION",
            entityId: 0,
            action: "PERMISSION_DENIED",
            previousValue: null,
            newValue: JSON.stringify({
              requiredPermission: keys.join(" | "),
              reason: "Role does not hold permission",
              attemptedPath: req.originalUrl,
            }),
            performedById: req.user.id,
          },
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Insufficient permissions",
        });
      }

      // ── Step 2: Check for GLOBAL scope across any key ───────────────────
      if (allGrantedScopes.includes("GLOBAL")) {
        req.isGlobalScope = true;
        return next();
      }

      // ── Step 3: Check Scoped Permission or Scope Resolver ─────────────────
      req.isGlobalScope = false;
      const targetResource = req.resource || { ...req.params, ...req.body };

      let isAllowed = false;
      if (typeof scopeResolverFn === "function") {
        isAllowed = await scopeResolverFn(req.user, targetResource, req);
      }

      if (!isAllowed) {

        // Log scoped denial to AuditLog
        const resourceId =
          targetResource && typeof targetResource.id === "number"
            ? targetResource.id
            : 0;

        await prisma.auditLog.create({
          data: {
            entityType: "PERMISSION",
            entityId: resourceId,
            action: "PERMISSION_DENIED",
            previousValue: null,
            newValue: JSON.stringify({
              requiredPermission: keys.join(" | "),
              attemptedScopes: allGrantedScopes,
              reason: "Resource out of granted scope",
              attemptedPath: req.originalUrl,
            }),
            performedById: req.user.id,
          },
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Insufficient scope permissions",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

const requirePermissionKey = (key) => {
  const keys = Array.isArray(key) ? key : [key];
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized: Authentication required",
        });
      }

      const userPermissions = await getPermissions(req.user, req);
      const hasAny = keys.some(
        (k) => userPermissions[k] && userPermissions[k].length > 0,
      );

      if (!hasAny) {
        await prisma.auditLog.create({
          data: {
            entityType: "PERMISSION",
            entityId: 0,
            action: "PERMISSION_DENIED",
            previousValue: null,
            newValue: JSON.stringify({
              requiredPermission: keys.join(" | "),
              reason: "Role does not hold permission",
              attemptedPath: req.originalUrl,
            }),
            performedById: req.user.id,
          },
        });

        return res.status(403).json({
          status: "error",
          message: "Forbidden: Insufficient permissions",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  requirePermission,
  requirePermissionKey,
};
