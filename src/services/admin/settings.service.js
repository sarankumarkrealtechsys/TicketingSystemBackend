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
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "id" SERIAL PRIMARY KEY,
        "key" VARCHAR(100) UNIQUE NOT NULL,
        "value" TEXT NOT NULL,
        "description" TEXT,
        "updatedById" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_EMAIL_NOTIFICATIONS },
      select: { value: true },
    });

    if (!record || record.value === null || record.value === undefined) {
      return true;
    }

    return record.value === "true" || record.value === true;
  } catch (error) {
    logger.warn(`[Settings] Prisma findUnique notice: ${error.message}, trying raw query`);
    try {
      const rows = await prisma.$queryRaw`
        SELECT value FROM "system_settings" WHERE key = ${SETTING_KEY_EMAIL_NOTIFICATIONS} LIMIT 1
      `;
      if (!rows || rows.length === 0) return true;
      return rows[0].value === "true" || rows[0].value === true;
    } catch (fallbackErr) {
      logger.error(
        `[Settings] Failed to read ${SETTING_KEY_EMAIL_NOTIFICATIONS} from PostgreSQL: ${fallbackErr.message}. Failing closed (notifications disabled).`,
      );
      return false;
    }
  }
};

/**
 * Retrieves the full email notification setting state.
 *
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const getEmailNotificationsSetting = async () => {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_EMAIL_NOTIFICATIONS },
      select: { value: true, updatedAt: true },
    });

    if (!record) {
      return {
        enabled: true,
        updatedAt: new Date(),
      };
    }

    return {
      enabled: record.value === "true" || record.value === true,
      updatedAt: record.updatedAt || new Date(),
    };
  } catch (error) {
    logger.warn(`[Settings] Prisma findUnique notice: ${error.message}, trying raw query`);
    try {
      const rows = await prisma.$queryRaw`
        SELECT value, "updatedAt" FROM "system_settings" WHERE key = ${SETTING_KEY_EMAIL_NOTIFICATIONS} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return {
          enabled: rows[0].value === "true" || rows[0].value === true,
          updatedAt: rows[0].updatedAt || new Date(),
        };
      }
    } catch (fallbackErr) {
      logger.error(
        `[Settings] Error retrieving ${SETTING_KEY_EMAIL_NOTIFICATIONS}: ${fallbackErr.message}`,
      );
    }
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
  const strValue = String(Boolean(enabled));
  const now = new Date();

  try {
    const updated = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_EMAIL_NOTIFICATIONS },
      update: {
        value: strValue,
      },
      create: {
        key: SETTING_KEY_EMAIL_NOTIFICATIONS,
        value: strValue,
      },
    });

    return {
      enabled: updated.value === "true" || updated.value === true,
      updatedAt: updated.updatedAt || now,
    };
  } catch (prismaErr) {
    logger.warn(`[Settings] Prisma upsert notice: ${prismaErr.message}, trying raw SQL fallbacks`);
    try {
      await prisma.$executeRaw`
        INSERT INTO "system_settings" (key, value, "updatedAt", "createdAt")
        VALUES (${SETTING_KEY_EMAIL_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET value = ${strValue}, "updatedAt" = ${now}
      `;
    } catch (rawErr) {
      await prisma.$executeRaw`
        INSERT INTO system_settings (key, value, updated_at, created_at)
        VALUES (${SETTING_KEY_EMAIL_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET value = ${strValue}, updated_at = ${now}
      `;
    }

    return {
      enabled: Boolean(enabled),
      updatedAt: now,
    };
  }
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
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_IN_APP_NOTIFICATIONS },
      select: { value: true },
    });

    if (!record || record.value === null || record.value === undefined) {
      return true;
    }

    return record.value === "true" || record.value === true;
  } catch (error) {
    logger.warn(`[Settings] Prisma findUnique notice: ${error.message}, trying raw query`);
    try {
      const rows = await prisma.$queryRaw`
        SELECT value FROM "system_settings" WHERE key = ${SETTING_KEY_IN_APP_NOTIFICATIONS} LIMIT 1
      `;
      if (!rows || rows.length === 0) return true;
      return rows[0].value === "true" || rows[0].value === true;
    } catch (fallbackErr) {
      logger.error(
        `[Settings] Failed to read ${SETTING_KEY_IN_APP_NOTIFICATIONS} from PostgreSQL: ${fallbackErr.message}. Failing closed (notifications disabled).`,
      );
      return false;
    }
  }
};

/**
 * Retrieves the full in-app notification setting state.
 *
 * @returns {Promise<{ enabled: boolean, updatedAt: Date }>}
 */
const getInAppNotificationsSetting = async () => {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_IN_APP_NOTIFICATIONS },
      select: { value: true, updatedAt: true },
    });

    if (!record) {
      return {
        enabled: true,
        updatedAt: new Date(),
      };
    }

    return {
      enabled: record.value === "true" || record.value === true,
      updatedAt: record.updatedAt || new Date(),
    };
  } catch (error) {
    logger.warn(`[Settings] Prisma findUnique notice: ${error.message}, trying raw query`);
    try {
      const rows = await prisma.$queryRaw`
        SELECT value, "updatedAt" FROM "system_settings" WHERE key = ${SETTING_KEY_IN_APP_NOTIFICATIONS} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return {
          enabled: rows[0].value === "true" || rows[0].value === true,
          updatedAt: rows[0].updatedAt || new Date(),
        };
      }
    } catch (fallbackErr) {
      logger.error(
        `[Settings] Error retrieving ${SETTING_KEY_IN_APP_NOTIFICATIONS}: ${fallbackErr.message}`,
      );
    }
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
  const strValue = String(Boolean(enabled));
  const now = new Date();

  try {
    const updated = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_IN_APP_NOTIFICATIONS },
      update: {
        value: strValue,
      },
      create: {
        key: SETTING_KEY_IN_APP_NOTIFICATIONS,
        value: strValue,
      },
    });

    return {
      enabled: updated.value === "true" || updated.value === true,
      updatedAt: updated.updatedAt || now,
    };
  } catch (prismaErr) {
    logger.warn(`[Settings] Prisma upsert notice: ${prismaErr.message}, trying raw SQL fallbacks`);
    try {
      await prisma.$executeRaw`
        INSERT INTO "system_settings" (key, value, "updatedAt", "createdAt")
        VALUES (${SETTING_KEY_IN_APP_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET value = ${strValue}, "updatedAt" = ${now}
      `;
    } catch (rawErr) {
      await prisma.$executeRaw`
        INSERT INTO system_settings (key, value, updated_at, created_at)
        VALUES (${SETTING_KEY_IN_APP_NOTIFICATIONS}, ${strValue}, ${now}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET value = ${strValue}, updated_at = ${now}
      `;
    }

    return {
      enabled: Boolean(enabled),
      updatedAt: now,
    };
  }
};

module.exports = {
  isEmailNotificationsEnabled,
  getEmailNotificationsSetting,
  updateEmailNotificationsSetting,
  isInAppNotificationsEnabled,
  getInAppNotificationsSetting,
  updateInAppNotificationsSetting,
};
