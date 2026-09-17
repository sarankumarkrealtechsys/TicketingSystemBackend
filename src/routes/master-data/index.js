const { Router } = require("express");
const departmentRouter = require("./department.routes");
const teamRouter = require("./team.routes");
const projectRouter = require("./project.routes");
const priorityRouter = require("./priority.routes");
const statusRouter = require("./status.routes");
const fieldDefinitionRouter = require("./field-definition.routes");

const router = Router();

router.use("/departments", departmentRouter);
router.use("/teams", teamRouter);
router.use("/projects", projectRouter);
router.use("/priority-levels", priorityRouter);
router.use("/ticket-statuses", statusRouter);
router.use("/ticket-fields", fieldDefinitionRouter);

module.exports = router;
