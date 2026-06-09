const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const QUEUE_NAME = 'scan-queue';
const JOB_NAME = 'execute-scan';

let scanQueue = null;
let reportQueue = null;
let alertQueue = null;
let monitoringQueue = null;
let sslQueue = null;
let domainExpiryQueue = null;

const SCAN_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: 100,
  removeOnFail: 50
};

const MONITORING_JOB_OPTIONS = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  removeOnComplete: 50,
  removeOnFail: 25
};

const initializeQueues = () => {
  const redisConnection = getRedisClient();
  if (!redisConnection) {
    throw new Error('Redis connection not available for queue setup');
  }

  logger.info('Initializing BullMQ Queues...');

  scanQueue = new Queue(QUEUE_NAME, { connection: redisConnection });
  reportQueue = new Queue('report-queue', { connection: redisConnection });
  alertQueue = new Queue('alert-queue', { connection: redisConnection });
  monitoringQueue = new Queue('monitoring-queue', { connection: redisConnection });
  sslQueue = new Queue('ssl-monitoring-queue', { connection: redisConnection });
  domainExpiryQueue = new Queue('domain-expiry-queue', { connection: redisConnection });

  logger.info('Queues initialized successfully.');
};

async function runScanInProcess(scanId, domain) {
  logger.warn(`Redis queue inactive — running scan in-process for: ${domain}`);
  const { executeScan } = require('./scanner.service');

  setImmediate(async () => {
    try {
      await executeScan(scanId);
    } catch (error) {
      logger.error(`In-process scan failed for ${scanId}: ${error.message}`);
    }
  });

  return { id: `in-process-${scanId}`, mode: 'in-process' };
}

async function runMonitoringInProcess(task) {
  const monitoringService = require('./monitoring.service');

  setImmediate(async () => {
    try {
      if (task === 'daily-scans') {
        await monitoringService.runDailyScansForAllDomains();
      } else if (task === 'daily-summary') {
        await monitoringService.sendDailySummaries();
      } else if (task === 'full-cycle') {
        await monitoringService.runFullMonitoringCycle();
      }
    } catch (error) {
      logger.error(`In-process monitoring task failed (${task}): ${error.message}`);
    }
  });

  return { id: `in-process-monitoring-${task}`, mode: 'in-process' };
}

async function runSslMonitoringInProcess() {
  const monitoringService = require('./monitoring.service');

  setImmediate(async () => {
    try {
      await monitoringService.runSslChecksForAllDomains();
    } catch (error) {
      logger.error(`In-process SSL monitoring failed: ${error.message}`);
    }
  });

  return { id: 'in-process-ssl-monitoring', mode: 'in-process' };
}

async function runDomainExpiryInProcess() {
  const monitoringService = require('./monitoring.service');

  setImmediate(async () => {
    try {
      await monitoringService.runDomainExpiryChecksForAllDomains();
    } catch (error) {
      logger.error(`In-process domain expiry monitoring failed: ${error.message}`);
    }
  });

  return { id: 'in-process-domain-expiry', mode: 'in-process' };
}

const addScanJob = async (scanId, domain, checks) => {
  if (!scanQueue) {
    return runScanInProcess(scanId, domain);
  }

  const job = await scanQueue.add(
    JOB_NAME,
    { scanId: String(scanId), domain, checks },
    {
      ...SCAN_JOB_OPTIONS,
      jobId: `scan-${scanId}`
    }
  );

  logger.info(`Scan job ${job.id} enqueued for ${domain} (scanId: ${scanId})`);
  return job;
};

const addReportJob = async (reportId, template, sections) => {
  if (!reportQueue) return null;
  return reportQueue.add('generate-pdf', { reportId, template, sections });
};

const addAlertJob = async (type, data) => {
  if (!alertQueue) return null;
  return alertQueue.add('dispatch-alert', { type, data });
};

const addMonitoringJob = async (task) => {
  if (!monitoringQueue) {
    return runMonitoringInProcess(task);
  }

  return monitoringQueue.add(
    'monitoring-task',
    { task },
    {
      ...MONITORING_JOB_OPTIONS,
      jobId: `monitoring-${task}-${Date.now()}`
    }
  );
};

const addSslMonitoringJob = async (task = 'ssl-checks') => {
  if (!sslQueue) {
    return runSslMonitoringInProcess();
  }

  return sslQueue.add(
    'ssl-monitoring-task',
    { task },
    {
      ...MONITORING_JOB_OPTIONS,
      jobId: `ssl-monitoring-${Date.now()}`
    }
  );
};

const addDomainExpiryJob = async (task = 'domain-expiry-checks') => {
  if (!domainExpiryQueue) {
    return runDomainExpiryInProcess();
  }

  return domainExpiryQueue.add(
    'domain-expiry-task',
    { task },
    {
      ...MONITORING_JOB_OPTIONS,
      jobId: `domain-expiry-${Date.now()}`
    }
  );
};

const getScanQueue = () => scanQueue;

module.exports = {
  initializeQueues,
  addScanJob,
  addReportJob,
  addAlertJob,
  addMonitoringJob,
  addSslMonitoringJob,
  addDomainExpiryJob,
  getScanQueue,
  runScanInProcess
};
