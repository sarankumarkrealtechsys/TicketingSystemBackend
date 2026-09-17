const auditLogService = require("../../services/admin/audit-log.service");

/**
 * GET /api/admin/audit-logs
 * Retrieves organization-wide system audit logs.
 * Restricted strictly to Admin (GLOBAL scope).
 */
const listAuditLogs = async (req, res, next) => {
  try {
    const data = await auditLogService.listAuditLogs({
      query: req.query,
    });

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listAuditLogs,
};
