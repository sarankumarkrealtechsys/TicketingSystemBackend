const http = require("http");
const dns = require("dns");

// Configure resilient DNS resolution for Node c-ares across all modules
try {
  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
  const currentServers = dns.getServers();
  if (!currentServers.length || (currentServers.length === 1 && currentServers[0] === "127.0.0.1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
} catch (e) {
  // Silently ignore if restricted
}

if (dns.Resolver && !dns.Resolver.__patchedForFallback) {
  const OrigResolver = dns.Resolver;
  class ResilientResolver extends OrigResolver {
    constructor(options) {
      super(options);
      try {
        const servers = this.getServers();
        if (!servers.length || (servers.length === 1 && servers[0] === "127.0.0.1")) {
          this.setServers(["8.8.8.8", "1.1.1.1"]);
        }
      } catch (err) {
        // Fallback silently
      }
    }
  }
  ResilientResolver.__patchedForFallback = true;
  dns.Resolver = ResilientResolver;
}

const app = require("./app");
const { env } = require("./config/env");
const { logger } = require("./config/logger");
const { connectRedis } = require("./lib/redis");
const { initSocket } = require("./lib/socket");

const server = http.createServer(app);

const startServer = async () => {
  try {
    // Attempt connections to optional / external infrastructure
    await connectRedis();

    // Initialize Socket.IO attached to the existing HTTP server instance
    initSocket(server);

    server.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      logger.info(`Health check: http://localhost:${env.PORT}/health`);
      logger.info(`Swagger API docs: http://localhost:${env.PORT}/api-docs`);
    });
  } catch (error) {
    logger.error(error, "Failed to start server");
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info("Received shutdown signal, closing server gracefully...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

startServer();
