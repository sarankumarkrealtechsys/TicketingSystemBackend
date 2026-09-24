const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  updateEmailNotificationsSchema,
  updateInAppNotificationsSchema,
} = require("../../validators/admin/settings.validator");
const settingsController = require("../../controllers/admin/settings.controller");

const router = Router();

// GET /api/admin/settings/email-notifications
router.get(
  "/email-notifications",
  authenticate,
  requirePermission("EMAIL_NOTIFICATIONS_MANAGE", resolveGlobal),
  settingsController.getEmailNotifications,
);

// PATCH /api/admin/settings/email-notifications
router.patch(
  "/email-notifications",
  authenticate,
  requirePermission("EMAIL_NOTIFICATIONS_MANAGE", resolveGlobal),
  validate(updateEmailNotificationsSchema),
  settingsController.updateEmailNotifications,
);

// GET /api/admin/settings/in-app-notifications
router.get(
  "/in-app-notifications",
  authenticate,
  requirePermission("IN_APP_NOTIFICATIONS_MANAGE", resolveGlobal),
  settingsController.getInAppNotifications,
);

// PATCH /api/admin/settings/in-app-notifications
router.patch(
  "/in-app-notifications",
  authenticate,
  requirePermission("IN_APP_NOTIFICATIONS_MANAGE", resolveGlobal),
  validate(updateInAppNotificationsSchema),
  settingsController.updateInAppNotifications,
);

module.exports = router;

