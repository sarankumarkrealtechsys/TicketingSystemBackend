const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const { env } = require('./config/env');
const { swaggerSpec } = require('./config/swagger');
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const { errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');
const healthRoutes = require('./routes/health/health.routes');

const app = express();

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging (single line format in CLI)
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate limiting on API routes
app.use('/api', apiRateLimiter);

// Swagger Documentation endpoint
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root health check endpoint directly at /health per spec
app.use('/health', healthRoutes);

// Web API routes mounted at /api
app.use('/api', routes);

// 404 fallback handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;
