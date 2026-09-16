const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { prisma } = require("../lib/prisma");

/**
 * Authentication Middleware
 * Reads JWT strictly from httpOnly cookie (env.COOKIE_NAME).
 * Verifies signature and expiration against env.JWT_SECRET.
 * Loads active user record with roleId and departmentId, attaching to req.user.
 * Rejects missing, invalid, or expired tokens with HTTP 401 without leaking internal details.
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Authentication required",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Invalid or expired token",
      });
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Invalid token payload",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        roleId: true,
        departmentId: true,
        status: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        userRole: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: User not found or inactive",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
};
