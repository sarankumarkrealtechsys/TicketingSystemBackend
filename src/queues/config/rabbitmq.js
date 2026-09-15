const amqp = require('amqplib');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();
    logger.info('RabbitMQ connected successfully');

    connection.on('error', (err) => {
      logger.warn(`RabbitMQ connection error: ${err.message}`);
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
    });

    return { connection, channel };
  } catch (error) {
    logger.warn(`RabbitMQ connection failed (optional service): ${error.message}`);
    return null;
  }
};

const getRabbitMQChannel = () => channel;

module.exports = { connectRabbitMQ, getRabbitMQChannel };
