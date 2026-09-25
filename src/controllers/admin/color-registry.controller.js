const colorRegistryService = require("../../services/admin/color-registry.service");

/**
 * GET /api/color-registry
 * Retrieves the global color registry overrides for priorities and statuses.
 */
const getColorRegistry = async (req, res, next) => {
  try {
    const data = await colorRegistryService.getColorRegistry();
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/color-registry
 * Updates the global color registry overrides and broadcasts real-time changes via Socket.IO.
 */
const updateColorRegistry = async (req, res, next) => {
  try {
    const { priorityColors, statusColors } = req.body;
    const userId = req.user?.id;
    const data = await colorRegistryService.saveColorRegistry(
      { priorityColors, statusColors },
      userId
    );
    return res.status(200).json({
      status: "success",
      data,
      message: "Global color registry updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getColorRegistry,
  updateColorRegistry,
};
