const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;
let redisUnavailableLogged = false;

function isRedisEnabled() {
  const explicit = String(process.env.REDIS_ENABLED || '').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(explicit)) return true;
  if (['false', '0', 'no'].includes(explicit)) return false;
  return Boolean(String(process.env.REDIS_URL || '').trim());
}

function logRedisUnavailable(message) {
  if (redisUnavailableLogged) return;
  redisUnavailableLogged = true;
  logger.warn(message);
}

const connectRedis = () => {
  try {
    if (!isRedisEnabled()) {
      logRedisUnavailable('Redis is disabled or REDIS_URL is not configured. Queue workers are optional and payment APIs will continue without Redis.');
      return null;
    }

    if (redisClient?.status === 'ready' || redisClient?.status === 'connecting' || redisClient?.status === 'connect') {
      return redisClient;
    }

    const redisUrl = String(process.env.REDIS_URL || '').trim();
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    logger.info(`Initializing Redis Client on ${redisUrl ? 'REDIS_URL' : `${host}:${port}`}...`);

    const options = {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1500),
      maxRetriesPerRequest: null, // Critical requirement for BullMQ
      retryStrategy() {
        return null;
      },
      reconnectOnError() {
        return false;
      }
    };

    redisClient = redisUrl ? new Redis(redisUrl, options) : new Redis({
      host,
      port,
      password,
      ...options
    });

    redisClient.on('connect', () => {
      logger.info('Redis TCP connection established.');
    });

    redisClient.on('ready', () => {
      logger.info('Redis connection is ready.');
    });

    redisClient.on('error', (err) => {
      logRedisUnavailable(`Redis unavailable: ${err.message}. Queue workers are optional and payment APIs will continue without Redis.`);
    });

    redisClient.connect().catch((err) => {
      logRedisUnavailable(`Redis connection failed: ${err.message}. Queue workers are optional and payment APIs will continue without Redis.`);
      redisClient?.disconnect();
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logRedisUnavailable(`Redis initialization failed: ${error.message}. Queue workers are optional and payment APIs will continue without Redis.`);
    redisClient = null;
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
