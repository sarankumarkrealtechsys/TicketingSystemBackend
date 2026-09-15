const http = require('http');
const app = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { initSocketIO } = require('./sockets');
const { connectRedis } = require('./lib/redis');

const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

const startServer = async () => {
  try {
    // Attempt connections to optional / external infrastructure
    await connectRedis();

    server.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      logger.info(`Health check: http://localhost:${env.PORT}/health`);
      logger.info(`Swagger API docs: http://localhost:${env.PORT}/api-docs`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
