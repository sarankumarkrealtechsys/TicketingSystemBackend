const nodemailer = require("nodemailer");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

let transporter = null;
let mockTransportEnabled = false;
let mockMailHistory = [];
let mockFailuresRemaining = 0;

const getTransporter = () => {
  if (!transporter) {
    const transportConfig = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
    };
    if (env.SMTP_USER && env.SMTP_PASSWORD) {
      transportConfig.auth = {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      };
    }
    transporter = nodemailer.createTransport(transportConfig);
  }
  return transporter;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends an email with an in-process 3-attempt exponential retry loop.
 * - Never throws or rejects; catches provider errors and logs them safely.
 *
 * @param {Object} mailOptions
 * @param {string} mailOptions.to
 * @param {string} mailOptions.subject
 * @param {string} mailOptions.text
 * @param {string} mailOptions.html
 * @returns {Promise<{ success: boolean, attempts: number, messageId?: string, error?: string }>}
 */
const sendEmail = async ({ to, subject, text, html }) => {
  const maxAttempts = 3;
  const backoffDelays = [0, 500, 1500];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (backoffDelays[attempt - 1] > 0) {
        await sleep(backoffDelays[attempt - 1]);
      }

      if (mockTransportEnabled) {
        if (mockFailuresRemaining > 0) {
          mockFailuresRemaining--;
          throw new Error("Simulated SMTP provider failure");
        }
        const messageId = `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const record = { to, subject, text, html, messageId, sentAt: new Date() };
        mockMailHistory.push(record);
        logger.debug(
          `[Email Service Mock] Sent to ${to}: "${subject}" (id: ${messageId})`,
        );
        return { success: true, attempts: attempt, messageId };
      }

      const activeTransporter = getTransporter();
      const info = await activeTransporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        html,
      });

      logger.debug(
        `[Email Service] Sent to ${to}: "${subject}" (id: ${info.messageId})`,
      );
      return { success: true, attempts: attempt, messageId: info.messageId };
    } catch (err) {
      const sanitizedError = (err.message || String(err)).replace(
        /password=[^\s&]+/gi,
        "password=***",
      );
      logger.warn(
        `[Email Service Attempt ${attempt}/${maxAttempts} Failed] to="${to}", subject="${subject}": ${sanitizedError}`,
      );

      if (attempt === maxAttempts) {
        logger.error(
          `[Email Service Final Failure] Exhausted all ${maxAttempts} in-process attempts for to="${to}", subject="${subject}": ${sanitizedError}`,
        );
        return { success: false, attempts: maxAttempts, error: sanitizedError };
      }
    }
  }

  return {
    success: false,
    attempts: maxAttempts,
    error: "Exhausted retry attempts",
  };
};

// Testing hooks
const __setMockTransport = (enabled) => {
  mockTransportEnabled = enabled;
};
const __setMockFailures = (count) => {
  mockFailuresRemaining = count;
};
const __getMockMailHistory = () => [...mockMailHistory];
const __clearMockMailHistory = () => {
  mockMailHistory = [];
  mockFailuresRemaining = 0;
};

module.exports = {
  sendEmail,
  __setMockTransport,
  __setMockFailures,
  __getMockMailHistory,
  __clearMockMailHistory,
};
