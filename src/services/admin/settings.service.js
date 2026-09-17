const { prisma } = require("../../lib/prisma");
const { logger } = require("../../config/logger");

const SETTING_KEY_EMAIL_NOTIFICATIONS = "EMAIL_NOTIFICATIONS_ENABLED";

/**
 * Checks if email notifications are globally enabled.
 * - Queries PostgreSQL system_settings directly (no Redis cache).
 * - Guaranteed fail-closed: if the database query fails, logs error safely and returns false.
 *
 * @returns {Promise<boolean>}
 */
const isEmailNotificationsEnabled = async () => {
  try {
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
    throw error;
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

module.exports = {
  isEmailNotificationsEnabled,
  getEmailNotificationsSetting,
  updateEmailNotificationsSetting,
};
