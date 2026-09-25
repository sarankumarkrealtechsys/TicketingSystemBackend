const { prisma } = require("../../lib/prisma");
const { logger } = require("../../config/logger");
const { getIO } = require("../../lib/socket");

const SETTING_KEY_COLOR_REGISTRY = "UI_COLOR_REGISTRY";

let tableEnsured = false;

/**
 * Ensures system_settings table exists with standard (id, key, value, created_at, updated_at) columns.
 */
const ensureTableExists = async () => {
  if (tableEnsured) return;
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    tableEnsured = true;
  } catch (err) {
    logger.warn(`[ColorRegistry] ensureTableExists notice: ${err.message}`);
  }
};

/**
 * Returns the current global color registry from PostgreSQL system_settings.
 * Uses raw query targeting only the 'value' column to avoid missing column errors.
 *
 * @returns {Promise<{ priorityColors: Record<string, string>, statusColors: Record<string, string> }>}
 */
const getColorRegistry = async () => {
  try {
    await ensureTableExists();
    const rows = await prisma.$queryRaw`
      SELECT value FROM system_settings WHERE key = ${SETTING_KEY_COLOR_REGISTRY} LIMIT 1
    `;

    if (!rows || rows.length === 0 || !rows[0].value) {
      return { priorityColors: {}, statusColors: {} };
    }

    const parsed = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    return {
      priorityColors: parsed.priorityColors || {},
      statusColors: parsed.statusColors || {},
    };
  } catch (error) {
    logger.error(`[ColorRegistry] Failed to fetch color registry: ${error.message}`);
    return { priorityColors: {}, statusColors: {} };
  }
};

/**
 * Updates and merges the color registry in PostgreSQL system_settings using raw SQL,
 * and broadcasts the updated registry to all connected Socket.IO clients.
 *
 * @param {{ priorityColors?: Record<string, string>, statusColors?: Record<string, string> }} updates
 * @param {number} [userId]
 * @returns {Promise<{ priorityColors: Record<string, string>, statusColors: Record<string, string> }>}
 */
const saveColorRegistry = async (updates = {}, userId = null) => {
  try {
    await ensureTableExists();
    const current = await getColorRegistry();

    const merged = {
      priorityColors: {
        ...current.priorityColors,
        ...(updates.priorityColors || {}),
      },
      statusColors: {
        ...current.statusColors,
        ...(updates.statusColors || {}),
      },
    };

    const valueStr = JSON.stringify(merged);
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO system_settings (key, value, updated_at, created_at)
      VALUES (${SETTING_KEY_COLOR_REGISTRY}, ${valueStr}, ${now}, ${now})
      ON CONFLICT (key) DO UPDATE
      SET value = ${valueStr}, updated_at = ${now}
    `;

    // Broadcast real-time update to all connected Socket.IO clients
    try {
      const io = getIO();
      if (io) {
        io.emit("colors:update", merged);
      }
    } catch (socketErr) {
      logger.warn(`[ColorRegistry] Socket broadcast notice: ${socketErr.message}`);
    }

    return merged;
  } catch (error) {
    logger.error(`[ColorRegistry] Failed to save color registry: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getColorRegistry,
  saveColorRegistry,
};
