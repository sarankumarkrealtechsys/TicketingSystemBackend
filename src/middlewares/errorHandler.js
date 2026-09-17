const { logger } = require("../config/logger");
const { env } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  logger.error(err);

  const statusCode =
    err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  // Sanitize Prisma errors in production to prevent DB schema leakage
  let message = err.message || "Internal Server Error";
  if (env.NODE_ENV === "production" && err.code && typeof err.code === "string" && err.code.startsWith("P")) {
    message = "A database error occurred. Please try again or contact support.";
  }

  res.status(statusCode).json({
    status: "error",
    message,
    stack: env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { errorHandler };
