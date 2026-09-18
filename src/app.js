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

// CORS configuration
const allowedOrigins = [
  env.CORS_ORIGIN,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server or curl) or allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
