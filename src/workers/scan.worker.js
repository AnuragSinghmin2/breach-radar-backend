const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const QUEUE_NAME = 'scan-queue';
const JOB_NAME = 'execute-scan';

let scanWorker = null;

const startScanWorker = () => {
  if (scanWorker) {
    logger.warn('Scan worker already running.');
    return scanWorker;
  }

  const redisConnection = getRedisClient();
  if (!redisConnection) {
    logger.error('Redis connection not available for Scan Worker');
    return null;
  }

  logger.info('Initializing Scan Worker...');

  scanWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { scanId, domain } = job.data;

      if (!scanId) {
        throw new Error('Scan job is missing scanId');
      }

      logger.info(`Scan worker picked job ${job.id} for ${domain || 'unknown domain'} (scanId: ${scanId})`);

      const { executeScan } = require('../services/scanner.service');
      const result = await executeScan(scanId);

      return {
        status: 'completed',
        jobId: job.id,
        scanId,
        ...result
      };
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.SCAN_WORKER_CONCURRENCY || 3)
    }
  );

  scanWorker.on('completed', (job, result) => {
    logger.info(`Scan job ${job.id} completed (scanId: ${result?.scanId}).`);
  });

  scanWorker.on('failed', (job, err) => {
    logger.error(`Scan job ${job?.id} failed: ${err.message}`);
  });

  scanWorker.on('error', (err) => {
    logger.error(`Scan worker error: ${err.message}`);
  });

  return scanWorker;
};

module.exports = {
  QUEUE_NAME,
  JOB_NAME,
  startScanWorker
};
