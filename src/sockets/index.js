const { Server } = require("socket.io");
const { logger } = require("../config/logger");

let io = null;

const initSocketIO = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO initialized");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
};

module.exports = { initSocketIO, getIO };
