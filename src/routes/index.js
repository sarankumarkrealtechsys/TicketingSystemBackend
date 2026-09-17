const { Router } = require("express");
const authRoutes = require("./auth.routes");
const healthRoutes = require("./health.routes");
const userRoutes = require("./user.routes");
const masterDataRoutes = require("./master-data");
const ticketRoutes = require("./ticket/ticket.routes");
const adminSettingsRoutes = require("./admin/settings.routes");
const adminAuditRoutes = require("./admin/audit.routes");
const timeEntryRoutes = require("./ticket/time-entry.routes");

const router = Router();

// Mount feature routes under /api
router.use("/auth", authRoutes);
router.use("/health", healthRoutes);
router.use("/users", userRoutes);
router.use("/tickets", ticketRoutes);
router.use("/admin/settings", adminSettingsRoutes);
router.use("/admin/audit-logs", adminAuditRoutes);
router.use("/time-entries", timeEntryRoutes);
router.use("/", masterDataRoutes); // mounts /departments, /teams, /projects, /priority-levels, /ticket-statuses, /ticket-fields

module.exports = router;
