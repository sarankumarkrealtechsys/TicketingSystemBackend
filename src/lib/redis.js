const { createClient } = require("redis");
const { env } = require("../config/env");
const { logger } = require("../config/logger");

const clientOptions = {
  url: env.REDIS_URL,
};
if (env.REDIS_PASSWORD) {
  clientOptions.password = env.REDIS_PASSWORD;
}

const redisClient = createClient(clientOptions);

redisClient.on("error", (err) => {
  logger.warn(`Redis Client Warning: ${err.message || err}`);
});

redisClient.on("connect", () => {
  logger.info("Redis connected successfully");
});

const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    logger.warn(`Redis connection failed (optional service): ${error.message}`);
  }
};

module.exports = { redisClient, connectRedis };
