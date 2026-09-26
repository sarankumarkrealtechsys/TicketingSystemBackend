// Polyfill BigInt serialization globally
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const { env } = require("./config/env");
const { swaggerSpec } = require("./config/swagger");
const { apiRateLimiter } = require("./middlewares/rateLimiter");
const { errorHandler } = require("./middlewares/errorHandler");
const routes = require("./routes");
const healthRoutes = require("./routes/health.routes");

const app = express();

// Security headers
app.use(helmet());

// CORS configuration - In development mode, all origins are permitted (origin: true); in production, strictly enforce allowedOrigins whitelist
const allowedOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : [];

// Chrome Private Network Access (PNA) support for local development
app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

app.use(
  cors({
    origin: env.NODE_ENV === "production" ? allowedOrigins : true,
    credentials: true,
  }),
);

// Body parsers
app.use(express.json({ limit: "500kb" }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// HTTP request logging (single line format in CLI)
if (env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Rate limiting on API routes
app.use("/api", apiRateLimiter);

// Swagger Documentation endpoint
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root health check endpoint directly at /health per spec
app.use("/health", healthRoutes);

// Prevent browser and intermediary HTTP caching for all API responses
app.use("/api", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  res.setHeader("Pragma", "no-cache");
  next();
});

// Web API routes mounted at /api
app.use("/api", routes);

// 404 fallback handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;
