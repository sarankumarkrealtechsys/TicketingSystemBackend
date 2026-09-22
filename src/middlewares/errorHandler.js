const { logger } = require("../config/logger");
const { env } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  logger.error(err);

  let statusCode =
    err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  let message = err.message || "Internal Server Error";

  // Detect Foreign Key / RESTRICT violations across Prisma and PostgreSQL
  const isForeignKeyViolation =
    err.code === "P2003" ||
    err.code === "23001" ||
    (typeof err.message === "string" &&
      (err.message.includes("violates RESTRICT") ||
        err.message.includes("foreign key constraint") ||
        err.message.includes("Foreign key constraint failed")));

  // Detect Unique Constraint violations
  const isUniqueViolation =
    err.code === "P2002" ||
    err.code === "23505" ||
    (typeof err.message === "string" &&
      (err.message.includes("Unique constraint failed") ||
        err.message.includes("duplicate key value")));

  // Detect Record Not Found in Prisma
  const isRecordNotFound =
    err.code === "P2025" ||
    (typeof err.message === "string" &&
      err.message.includes("Record to delete does not exist"));

  // Detect any other raw Prisma / Connector / Postgres error
  const isRawDatabaseError =
    (typeof err.code === "string" && err.code.startsWith("P")) ||
    (typeof err.message === "string" &&
      (err.message.includes("Invalid `prisma.") ||
        err.message.includes("ConnectorError") ||
        err.message.includes("QueryError") ||
        err.message.includes("PostgresError") ||
        err.message.includes("prisma.")));

  if (isForeignKeyViolation) {
    statusCode = 400;
    message =
      "This record cannot be deleted because it is currently referenced by other active records (such as users, teams, or tickets). Please archive or reassign associated records instead.";
  } else if (isUniqueViolation) {
    statusCode = 400;
    message = "A record with this information already exists.";
  } else if (isRecordNotFound) {
    statusCode = 404;
    message = "The requested record was not found or has already been removed.";
  } else if (isRawDatabaseError && !err.isOperational) {
    statusCode = statusCode === 200 || statusCode === 500 ? 500 : statusCode;
    message =
      "A database error occurred while processing your request. Please try again or contact support.";
  }

  res.status(statusCode).json({
    status: "error",
    message,
    stack: env.NODE_ENV === "production" ? undefined : (isRawDatabaseError ? undefined : err.stack),
  });
};

module.exports = { errorHandler };

