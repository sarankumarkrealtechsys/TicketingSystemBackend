const healthService = require('../../services/health/health.service');

/**
 * Health Controller
 * Contains business logic, processes HTTP req/res, and calls DB services
 */
const getHealth = async (req, res, next) => {
  try {
    const isDetailed = req.query.detailed === 'true';

    // Basic health response
    const healthStatus = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    // Business logic: if detailed requested, execute DB health check via service
    if (isDetailed) {
      const dbHealth = await healthService.checkDatabaseHealth();
      healthStatus.database = dbHealth.database;
    }

    return res.status(200).json(healthStatus);
  } catch (error) {
    next(error);
  }
};

module.exports = { getHealth };
