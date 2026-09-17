const { prisma } = require("../lib/prisma");
const { redisClient } = require("../lib/redis");

/**
 * Health Controller (Direct DB Operations)
 */
const getHealth = async (req, res, next) => {
  try {
    const isDetailed = req.query.detailed === "true";

    // Basic health response
    const healthStatus = {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    // If detailed requested, execute DB & Redis health check directly
    if (isDetailed) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        healthStatus.database = "connected";
      } catch (error) {
        healthStatus.database = "disconnected";
        healthStatus.error = error.message;
      }

      healthStatus.redis =
        redisClient && redisClient.isOpen ? "connected" : "disconnected";
    }

    return res.status(200).json(healthStatus);
  } catch (error) {
    next(error);
  }
};

module.exports = { getHealth };
