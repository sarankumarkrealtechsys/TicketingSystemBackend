const { Router } = require("express");
const authRoutes = require("./auth/auth.routes");
const healthRoutes = require("./health/health.routes");
const userRoutes = require("./user/user.routes");
const teamRoutes = require("./team/team.routes");
const departmentRoutes = require("./department/department.routes");
const projectRoutes = require("./project/project.routes");
const priorityRoutes = require("./priority/priority.routes");
const ticketStatusRoutes = require("./ticket-status/ticket-status.routes");
const ticketRoutes = require("./ticket/ticket.routes");
const ticketFieldRoutes = require("./ticket-field/ticket-field.routes");

const router = Router();

// Mount feature routes under /api
router.use("/auth", authRoutes);
router.use("/health", healthRoutes);
router.use("/users", userRoutes);
router.use("/teams", teamRoutes);
router.use("/departments", departmentRoutes);
router.use("/projects", projectRoutes);
router.use("/priority-levels", priorityRoutes);
router.use("/ticket-statuses", ticketStatusRoutes);
router.use("/tickets", ticketRoutes);
router.use("/ticket-fields", ticketFieldRoutes);

module.exports = router;
