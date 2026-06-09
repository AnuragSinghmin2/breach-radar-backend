const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const Alert = require('../models/Alert');
const alertService = require('../services/alert.service');
const emailService = require('../services/email.service');

async function dispatchMonitoringAlert(alertId) {
  const alert = await Alert.findById(alertId).populate('domainId', 'domain');
  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`);
  }

  if (alert.emailSent) {
    return { status: 'skipped', reason: 'already_sent' };
  }

  const domainName = alert.domainId?.domain || alert.metadata?.domain || 'Unknown domain';
  let template;

  switch (alert.type) {
    case 'ssl_expiry':
      template = emailService.templateSslExpiryWarning({
        domain: domainName,
        daysRemaining: alert.metadata?.daysRemaining,
        expiryDate: alert.metadata?.expiryDate,
        severity: alert.severity
      });
      break;
    case 'domain_expiry':
      template = emailService.templateDomainExpiryWarning({
        domain: domainName,
        daysRemaining: alert.metadata?.daysRemaining,
        expiryDate: alert.metadata?.expiryDate,
        registrar: alert.metadata?.registrar,
        severity: alert.severity
      });
      break;
    case 'critical_finding':
      template = emailService.templateCriticalFindings({
        workspaceName: alert.metadata?.workspaceName || 'Workspace',
        domain: domainName,
        criticalCount: alert.metadata?.counts?.critical || 0,
        highCount: alert.metadata?.counts?.high || 0,
        scanId: alert.scanId
      });
      break;
    default:
      template = {
        subject: `[Breach Radar] ${alert.title}`,
        html: emailService.templateSslExpiryWarning({
          domain: domainName,
          daysRemaining: alert.metadata?.daysRemaining,
          expiryDate: alert.metadata?.expiryDate,
          severity: alert.severity
        }).html
      };
  }

  await alertService.dispatchAlertEmail(alert, template);
  return { status: 'dispatched', alertId };
}

const startAlertWorker = () => {
  const redisConnection = getRedisClient();
  if (!redisConnection) {
    logger.error('Redis connection not available for Alert Worker');
    return;
  }

  logger.info('Initializing Alert Worker...');

  const worker = new Worker(
    'alert-queue',
    async (job) => {
      const { type, data } = job.data;
      logger.info(`Alert Worker processing job ${job.id}: ${type}`);

      if (type === 'monitoring-alert' && data?.alertId) {
        return dispatchMonitoringAlert(data.alertId);
      }

      return { status: 'ignored', type };
    },
    { connection: redisConnection, concurrency: 2 }
  );

  worker.on('completed', (job) => {
    logger.info(`Alert job ${job.id} dispatched successfully.`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Alert job ${job?.id} dispatch failed: ${err.message}`);
  });

  return worker;
};

module.exports = {
  startAlertWorker
};
