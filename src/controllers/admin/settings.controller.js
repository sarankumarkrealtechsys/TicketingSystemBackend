const settingsService = require("../../services/admin/settings.service");

/**
 * GET /api/admin/settings/email-notifications
 * Returns the current global Email Notifications toggle status.
 */
const getEmailNotifications = async (req, res, next) => {
  try {
    const data = await settingsService.getEmailNotificationsSetting();
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/settings/email-notifications
 * Updates the global Email Notifications toggle in PostgreSQL.
 */
const updateEmailNotifications = async (req, res, next) => {
  try {
    const data = await settingsService.updateEmailNotificationsSetting(
      req.body.enabled,
    );
    return res.status(200).json({
      status: "success",
      data,
      message: "Email notifications setting updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEmailNotifications,
  updateEmailNotifications,
};
