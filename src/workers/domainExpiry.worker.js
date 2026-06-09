const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const monitoringService = require('../services/monitoring.service');

const startDomainExpiryWorker = () => {
  const redisConnection = getRedisClient();
  if (!redisConnection) {
    logger.error('Redis connection not available for Domain Expiry Worker');
    return;
  }

  logger.info('Initializing Domain Expiry Worker...');

  const worker = new Worker(
    'domain-expiry-queue',
    async (job) => {
      logger.info(`Domain Expiry Worker processing job ${job.id}`);
      return monitoringService.runDomainExpiryChecksForAllDomains();
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info(`Domain expiry job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Domain expiry job ${job?.id} failed: ${err.message}`);
  });

  return worker;
};

module.exports = {
  startDomainExpiryWorker
};
