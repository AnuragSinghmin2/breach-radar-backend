const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const monitoringService = require('../services/monitoring.service');

const startSslWorker = () => {
  const redisConnection = getRedisClient();
  if (!redisConnection) {
    logger.error('Redis connection not available for SSL Monitoring Worker');
    return;
  }

  logger.info('Initializing SSL Monitoring Worker...');

  const worker = new Worker(
    'ssl-monitoring-queue',
    async (job) => {
      logger.info(`SSL Monitoring Worker processing job ${job.id}`);
      return monitoringService.runSslChecksForAllDomains();
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info(`SSL monitoring job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`SSL monitoring job ${job?.id} failed: ${err.message}`);
  });

  return worker;
};

module.exports = {
  startSslWorker
};
