const { prisma } = require("../../lib/prisma");
const { logger } = require("../../config/logger");

const SETTING_KEY_EMAIL_NOTIFICATIONS = "EMAIL_NOTIFICATIONS_ENABLED";
const SETTING_KEY_IN_APP_NOTIFICATIONS = "IN_APP_NOTIFICATIONS_ENABLED";

let tableEnsured = false;

/**
 * Ensures the system_settings table exists in PostgreSQL.
 * Allows the service to self-heal if the table was not pre-migrated.
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
    logger.warn(`[Settings] ensureTableExists notice: ${err.message}`);
  }
};

/**
 * Checks if email notifications are globally enabled.
 * - Queries PostgreSQL system_settings directly (no Redis cache).
 * - Guaranteed fail-closed: if the database query fails, logs error safely and returns false.
 *
 * @returns {Promise<boolean>}
 */
const isEmailNotificationsEnabled = async () => {
  try {
    await ensureTableExists();
    const rows = await prisma.$queryRaw`
      SELECT value FROM system_settings WHERE key = ${SETTING_KEY_EMAIL_NOTIFICATIONS} LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      // Default to enabled if table exists but key is not yet seeded
      return true;
    }

    return rows[0].value === "true" || rows[0].value === true;
  } catch (error) {
    logger.error(
      `[Settings] Failed to read ${SETTING_KEY_EMAIL_NOTIFICATIONS} from PostgreSQL: ${error.message}. Failing closed (notifications disabled).`,
    );
    return false;
  }
};

/**
 * Retrieves the full email notification setting state.
 *
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const getEmailNotificationsSetting = async () => {
  try {
    await ensureTableExists();
    const rows = await prisma.$queryRaw`
      SELECT value, updated_at FROM system_settings WHERE key = ${SETTING_KEY_EMAIL_NOTIFICATIONS} LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return {
        enabled: true,
        updatedAt: new Date(),
      };
    }

    return {
      enabled: rows[0].value === "true" || rows[0].value === true,
      updatedAt: rows[0].updated_at || new Date(),
    };
  } catch (error) {
    logger.error(
      `[Settings] Error retrieving ${SETTING_KEY_EMAIL_NOTIFICATIONS}: ${error.message}`,
    );
    // Return safe default so frontend does not crash with 500 error
    return {
      enabled: true,
      updatedAt: new Date(),
    };
  }
};

/**
 * Updates the global email notification toggle in PostgreSQL.
 * - Strictly persists to PostgreSQL; does NOT write to Redis.
 *
 * @param {boolean} enabled
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const updateEmailNotificationsSetting = async (enabled) => {
  await ensureTableExists();
  const strValue = String(Boolean(enabled));
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO system_settings (key, value, updated_at, created_at)
    VALUES (${SETTING_KEY_EMAIL_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
    ON CONFLICT (key) DO UPDATE
    SET value = ${strValue}, updated_at = ${now}
  `;

  return {
    enabled: Boolean(enabled),
    updatedAt: now,
  };
};

/**
 * Checks if in-app notifications are globally enabled.
 * - Queries PostgreSQL system_settings directly (no Redis cache).
 * - Guaranteed fail-closed: if the database query fails, logs error safely and returns false.
 *
 * @returns {Promise<boolean>}
 */
const isInAppNotificationsEnabled = async () => {
  try {
    await ensureTableExists();
    const rows = await prisma.$queryRaw`
      SELECT value FROM system_settings WHERE key = ${SETTING_KEY_IN_APP_NOTIFICATIONS} LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      // Default to enabled if table exists but key is not yet seeded
      return true;
    }

    return rows[0].value === "true" || rows[0].value === true;
  } catch (error) {
    logger.error(
      `[Settings] Failed to read ${SETTING_KEY_IN_APP_NOTIFICATIONS} from PostgreSQL: ${error.message}. Failing closed (notifications disabled).`,
    );
    return false;
  }
};

/**
 * Retrieves the full in-app notification setting state.
 *
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const getInAppNotificationsSetting = async () => {
  try {
    await ensureTableExists();
    const rows = await prisma.$queryRaw`
      SELECT value, updated_at FROM system_settings WHERE key = ${SETTING_KEY_IN_APP_NOTIFICATIONS} LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return {
        enabled: true,
        updatedAt: new Date(),
      };
    }

    return {
      enabled: rows[0].value === "true" || rows[0].value === true,
      updatedAt: rows[0].updated_at || new Date(),
    };
  } catch (error) {
    logger.error(
      `[Settings] Error retrieving ${SETTING_KEY_IN_APP_NOTIFICATIONS}: ${error.message}`,
    );
    // Return safe default so frontend does not crash with 500 error
    return {
      enabled: true,
      updatedAt: new Date(),
    };
  }
};

/**
 * Updates the global in-app notification toggle in PostgreSQL.
 * - Strictly persists to PostgreSQL; does NOT write to Redis.
 *
 * @param {boolean} enabled
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const updateInAppNotificationsSetting = async (enabled) => {
  await ensureTableExists();
  const strValue = String(Boolean(enabled));
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO system_settings (key, value, updated_at, created_at)
    VALUES (${SETTING_KEY_IN_APP_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
    ON CONFLICT (key) DO UPDATE
    SET value = ${strValue}, updated_at = ${now}
  `;

  return {
    enabled: Boolean(enabled),
    updatedAt: now,
  };
};

module.exports = {
  isEmailNotificationsEnabled,
  getEmailNotificationsSetting,
  updateEmailNotificationsSetting,
  isInAppNotificationsEnabled,
  getInAppNotificationsSetting,
  updateInAppNotificationsSetting,
};
