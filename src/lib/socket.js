const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { prisma } = require("./prisma");
const { isTokenBlacklisted } = require("../utils/tokenBlacklist");
const { logger } = require("../config/logger");

let io = null;

/**
 * Socket.IO Authentication Middleware.
 *
 * Replicates the security checks of Express authenticate middleware:
 * 1. Parses raw HTTP Cookie header using the standard 'cookie' parser.
 * 2. Extracts and verifies JWT against env.JWT_SECRET.
 * 3. Checks token blacklist via isTokenBlacklisted(userId, decoded.iat).
 * 4. Loads active user from PostgreSQL and verifies status === 'ACTIVE'.
 * 5. Attaches authenticated user to socket.data.user.
 *
 * KNOWN ARCHITECTURAL LIMITATION & SECURITY NOTE:
 * Socket.IO handshake authentication executes once during the initial HTTP upgrade/connection handshake.
 * If a user is deactivated or logs out in another browser session while an existing socket connection
 * remains open, this specific socket connection is not actively severed mid-session until the user
 * disconnects, closes the tab, or the connection reconnects.
 * However, all REST endpoints (PATCH, GET, etc.) immediately enforce token blacklist and status checks
 * on every single request, rejecting any subsequent API calls with 401 Unauthorized.
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const rawCookieHeader = socket.handshake.headers.cookie;
    if (!rawCookieHeader) {
      return next(new Error("Unauthorized: No cookies provided"));
    }

    const parsedCookies = cookie.parse(rawCookieHeader);
    const token = parsedCookies[env.COOKIE_NAME];
    if (!token) {
      return next(new Error("Unauthorized: Authentication token missing"));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (_err) {
      return next(new Error("Unauthorized: Invalid or expired token"));
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return next(new Error("Unauthorized: Invalid token payload"));
    }

    // Token blacklist check (logout, password reset, session revocation)
    if (decoded.iat) {
      const blacklisted = await isTokenBlacklisted(userId, decoded.iat);
      if (blacklisted) {
        return next(new Error("Unauthorized: Session has been invalidated"));
      }
    }

    // Verify active user in database
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        roleId: true,
        departmentId: true,
        status: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return next(new Error("Unauthorized: User not found or inactive"));
    }

    // Attach authenticated user identity to socket instance
    socket.data.user = user;
    next();
  } catch (error) {
    logger.error(`[Socket.IO] Handshake authentication error: ${error.message}`);
    next(new Error("Internal authentication error"));
  }
};

/**
 * Initializes Socket.IO attached to the provided HTTP server.
 * Reuses identical CORS origins as Express app.js.
 *
 * @param {import("http").Server} server
 * @returns {Server}
 */
const initSocket = (server) => {
  // CORS configuration - sourced dynamically from env.CORS_ORIGIN (supports comma-separated list)
  const allowedOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean)
    : [];

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        const normalizedOrigin = origin ? origin.replace(/\/+$/, "") : "";
        if (!origin || allowedOrigins.includes(normalizedOrigin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    },
  });

  // Attach handshake authentication
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const roomName = `user:${user.id}`;

    // Join room dedicated to this user ID (allows multi-tab / multi-device fanout)
    socket.join(roomName);
    logger.info(
      `[Socket.IO] User ${user.id} (${user.username}) connected on socket ${socket.id} (joined room: ${roomName})`,
    );

    socket.on("disconnect", (reason) => {
      logger.info(
        `[Socket.IO] User ${user.id} disconnected (${socket.id}): ${reason}`,
      );
    });
  });

  logger.info("[Socket.IO] Socket server initialized successfully");
  return io;
};

/**
 * Returns the singleton Socket.IO instance.
 * Throws an error if called prior to initSocket().
 *
 * @returns {Server}
 */
const getIO = () => {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized. Call initSocket(server) first.",
    );
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
};
