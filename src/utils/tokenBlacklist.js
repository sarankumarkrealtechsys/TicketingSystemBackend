const { redisClient } = require("../lib/redis");
const { logger } = require("../config/logger");

/**
 * Token Blacklist Utility (Redis-backed)
 *
 * Provides session invalidation for JWT tokens by storing blacklist entries
 * in Redis. Used when:
 * - A user logs out
 * - A user is deactivated
 * - A user's password is changed
 *
 * Key format: `token-blacklist:{userId}:{iat}`
 * TTL: Remaining lifetime of the JWT token.
 *
 * Guaranteed to never throw if Redis is down or unreachable.
 */

/**
 * Blacklists all tokens for a given user issued before `now`.
 * Stores a key with TTL matching the remaining JWT lifetime.
 *
 * @param {number} userId - The user ID to blacklist
 * @param {number} maxTokenLifetimeSeconds - Maximum token lifetime in seconds (e.g. 30 days = 2592000)
 */
const blacklistUserTokens = async (userId, maxTokenLifetimeSeconds = 2592000) => {
  try {
    if (!redisClient || !redisClient.isOpen) return;

    const key = `token-blacklist:user:${userId}`;
    // Store the timestamp (in seconds) at which the blacklist was issued
    const blacklistedAt = Math.floor(Date.now() / 1000);

    await redisClient.set(key, String(blacklistedAt), {
      EX: maxTokenLifetimeSeconds,
    });

    logger.debug(`[Token Blacklist] Blacklisted user ${userId} tokens issued before ${blacklistedAt}`);
  } catch (err) {
    logger.warn(`[Token Blacklist Error] userId=${userId}: ${err.message || err}`);
  }
};

/**
 * Checks if a token is blacklisted.
 * A token is blacklisted if the user has a blacklist entry AND the token's `iat`
 * (issued-at) is before the blacklist timestamp.
 *
 * @param {number} userId
 * @param {number} iat - Token's issued-at timestamp (seconds since epoch)
 * @returns {Promise<boolean>} true if blacklisted
 */
const isTokenBlacklisted = async (userId, iat) => {
  try {
    if (!redisClient || !redisClient.isOpen) return false;

    const key = `token-blacklist:user:${userId}`;
    const blacklistedAtStr = await redisClient.get(key);

    if (!blacklistedAtStr) return false;

    const blacklistedAt = parseInt(blacklistedAtStr, 10);
    // Token is blacklisted if it was issued before the blacklist timestamp
    return iat <= blacklistedAt;
  } catch (err) {
    logger.warn(`[Token Blacklist Check Error] userId=${userId}: ${err.message || err}`);
    // Fail-open: if Redis is unavailable, allow the request through
    // (the auth middleware's DB user check will still catch deactivated users)
    return false;
  }
};

module.exports = {
  blacklistUserTokens,
  isTokenBlacklisted,
};
