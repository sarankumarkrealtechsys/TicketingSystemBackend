const inAppNotificationService = require("../../services/notification/in-app-notification.service");

/**
 * GET /api/notifications
 * Returns notifications list and unreadCount for the logged-in user.
 */
const getNotifications = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const filter = req.query.filter || "all";
    const search = req.query.search || "";
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const data = await inAppNotificationService.getUserNotifications(
      req.user.id,
      { unreadOnly, filter, search, page, limit },
    );

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
const markAsRead = async (req, res, next) => {
  try {
    const notificationId = Number(req.params.id);
    await inAppNotificationService.markNotificationAsRead(
      req.user.id,
      notificationId,
    );

    return res.status(200).json({
      status: "success",
      message: "Notification marked as read",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications as read for the logged-in user.
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const result = await inAppNotificationService.markAllNotificationsAsRead(
      req.user.id,
    );

    return res.status(200).json({
      status: "success",
      message: "All notifications marked as read",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
