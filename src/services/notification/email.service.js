const nodemailer = require("nodemailer");
const dns = require("dns");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

// Resolve Windows/c-ares DNS loopback issue where dns.getServers() defaults to ['127.0.0.1']
try {
  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
  const currentServers = dns.getServers();
  if (!currentServers.length || (currentServers.length === 1 && currentServers[0] === "127.0.0.1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
} catch (e) {
  // Silently ignore if restricted
}

// Wrap dns.Resolver so Nodemailer's internal resolveHostname calls use reliable public DNS
if (dns.Resolver && !dns.Resolver.__patchedForFallback) {
  const OrigResolver = dns.Resolver;
  class ResilientResolver extends OrigResolver {
    constructor(options) {
      super(options);
      try {
        const servers = this.getServers();
        if (!servers.length || (servers.length === 1 && servers[0] === "127.0.0.1")) {
          this.setServers(["8.8.8.8", "1.1.1.1"]);
        }
      } catch (err) {
        // Fallback silently
      }
    }
  }
  ResilientResolver.__patchedForFallback = true;
  dns.Resolver = ResilientResolver;
}

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
      family: 4, // Force IPv4 to prevent unroutable IPv6 timeouts
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
