const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Insufficient role permissions' });
    }
    next();
  };
};

const authorizePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    const userPermissions = req.user?.permissions || [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!req.user || !hasAll) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Missing required permissions' });
    }
    next();
  };
};

module.exports = { authorizeRoles, authorizePermissions };
