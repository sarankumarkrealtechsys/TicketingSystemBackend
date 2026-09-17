const { redisClient } = require("../lib/redis");
const { logger } = require("../config/logger");

/**
 * Serializes query parameters deterministically for use in cache keys.
 * Sorts keys alphabetically so { a: 1, b: 2 } and { b: 2, a: 1 } generate identical keys.
 */
const serializeQueryParams = (query) => {
  if (!query || typeof query !== "object" || Object.keys(query).length === 0) {
    return "default";
  }
  return Object.keys(query)
    .sort()
    .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== "")
    .map((k) => `${k}=${String(query[k]).trim()}`)
    .join("&") || "default";
};

/**
 * Cache-wrapper helper: attempts Redis GET, falls through to fetchFn() on cache miss or Redis error.
 * On fetch success, attempts non-blocking Redis SET with TTL in seconds.
 * Guaranteed to never throw if Redis is down or unreachable.
 */
const getOrSetCache = async (key, ttlSeconds, fetchFn) => {
  try {
    if (redisClient && redisClient.isOpen) {
      const cachedRaw = await redisClient.get(key);
      if (cachedRaw !== null && cachedRaw !== undefined) {
        return JSON.parse(cachedRaw);
      }
    }
  } catch (err) {
    logger.warn(`[Cache GET Error] key="${key}": ${err.message || err}`);
  }

  // Cache miss or Redis unavailable: execute DB query directly
  const data = await fetchFn();

  try {
    if (redisClient && redisClient.isOpen && data !== undefined && data !== null) {
      await redisClient.set(key, JSON.stringify(data), { EX: ttlSeconds });
    }
  } catch (err) {
    logger.warn(`[Cache SET Error] key="${key}": ${err.message || err}`);
  }

  return data;
};

/**
 * Invalidation helper: non-blocking SCAN iteration to delete all keys matching pattern.
 * Guards against empty keys array before calling DEL.
 * Guaranteed to never throw if Redis is down or unreachable.
 */
const invalidateCachePattern = async (pattern) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return;
    }

    const keys = [];
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }

    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.debug(`[Cache Invalidated] Pattern="${pattern}" cleared ${keys.length} key(s)`);
    }
  } catch (err) {
    logger.warn(`[Cache Invalidate Error] pattern="${pattern}": ${err.message || err}`);
  }
};

module.exports = {
  getOrSetCache,
  invalidateCachePattern,
  serializeQueryParams,
};
