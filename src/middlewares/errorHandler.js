const { logger } = require("../config/logger");
const { env } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  logger.error(err);

  const statusCode =
    err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  res.status(statusCode).json({
    status: "error",
    message: err.message || "Internal Server Error",
    stack: env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { errorHandler };
