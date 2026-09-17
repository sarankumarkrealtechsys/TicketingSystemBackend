const { Router } = require("express");
const { authenticate } = require("../../middlewares/auth");
const { requirePermission } = require("../../middlewares/rbac");
const { resolveGlobal } = require("../../services/auth/scope.service");
const { validate } = require("../../validators");
const {
  updateEmailNotificationsSchema,
} = require("../../validators/admin/settings.validator");
const settingsController = require("../../controllers/admin/settings.controller");

const router = Router();

// GET /api/admin/settings/email-notifications
router.get(
  "/email-notifications",
  authenticate,
  requirePermission("SYSTEM_SETTINGS_MANAGE", resolveGlobal),
  settingsController.getEmailNotifications,
);

// PATCH /api/admin/settings/email-notifications
router.patch(
  "/email-notifications",
  authenticate,
  requirePermission("SYSTEM_SETTINGS_MANAGE", resolveGlobal),
  validate(updateEmailNotificationsSchema),
  settingsController.updateEmailNotifications,
);

module.exports = router;
