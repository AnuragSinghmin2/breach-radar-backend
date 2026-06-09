const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const monitoringService = require('../services/monitoring.service');

const startMonitoringWorker = () => {
  const redisConnection = getRedisClient();
  if (!redisConnection) {
    logger.error('Redis connection not available for Monitoring Worker');
    return;
  }

  logger.info('Initializing Monitoring Worker...');

  const worker = new Worker(
    'monitoring-queue',
    async (job) => {
      const { task } = job.data;
      logger.info(`Monitoring Worker processing task: ${task}`);

      if (task === 'daily-scans') {
        return monitoringService.runDailyScansForAllDomains();
      }

      if (task === 'daily-summary') {
        return monitoringService.sendDailySummaries();
      }

      if (task === 'full-cycle') {
        return monitoringService.runFullMonitoringCycle();
      }

      throw new Error(`Unknown monitoring task: ${task}`);
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info(`Monitoring job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Monitoring job ${job?.id} failed: ${err.message}`);
  });

  return worker;
};

module.exports = {
  startMonitoringWorker
};
