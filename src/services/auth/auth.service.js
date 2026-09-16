const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");
const { prisma } = require("../../lib/prisma");

/**
 * Parses JWT expiration string (e.g. '30d', '15m') into milliseconds.
 */
const parseExpiresInMs = (expiresIn) => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30 days
  const val = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return val * (multipliers[unit] || multipliers.d);
};

/**
 * Standard cookie configuration for secure token delivery.
 */
const getCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: parseExpiresInMs(env.JWT_EXPIRES_IN),
  path: "/",
});

/**
 * Cookie options for clearing the auth cookie upon logout.
 */
const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
});

/**
 * Finds user by username (case-sensitive unique lookup).
 * Email is never used for login.
 */
const findUserByUsername = async (username) => {
  return prisma.user.findUnique({
    where: { username },
    include: {
      department: {
        select: { id: true, name: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
    },
  });
};

/**
 * Compares plaintext password against stored bcrypt hash.
 */
const verifyPassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Generates an Access Token with minimal payload (userId, roleId).
 * Permissions are resolved dynamically per-request.
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      roleId: user.roleId,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
};

module.exports = {
  findUserByUsername,
  verifyPassword,
  generateAccessToken,
  getCookieOptions,
  getClearCookieOptions,
};
