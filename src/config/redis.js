const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

const connectRedis = () => {
  try {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    logger.info(`Initializing Redis Client on ${host}:${port}...`);

    redisClient = new Redis({
      host,
      port,
      password,
      maxRetriesPerRequest: null, // Critical requirement for BullMQ
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redisClient.on('connect', () => {
      logger.info('Redis connection established successfully.');
    });

    redisClient.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    return redisClient;
  } catch (error) {
    logger.error(`Redis initialization failed: ${error.message}`);
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    return connectRedis();
  }
  return redisClient;
};

module.exports = {
  connectRedis,
  getRedisClient
};
