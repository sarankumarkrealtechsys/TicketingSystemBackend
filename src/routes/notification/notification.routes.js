const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const notificationController = require("../../controllers/notification/notification.controller");

const router = Router();

// All notification routes require authenticated session
router.use(authenticate);

router.get("/", notificationController.getNotifications);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);

module.exports = router;
