const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth:
    env.SMTP_USER && env.SMTP_PASSWORD
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        }
      : undefined,
});

const sendMail = async (options) => {
  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      ...options,
    });
    logger.info(`Message sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

module.exports = { sendMail };
