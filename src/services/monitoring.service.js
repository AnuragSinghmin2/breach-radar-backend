const Domain = require('../models/Domain');
const Scan = require('../models/Scan');
const Alert = require('../models/Alert');
const MonitoringEvent = require('../models/MonitoringEvent');
const Workspace = require('../models/Workspace');
const {
  DOMAIN_VERIFICATION_STATUS,
  SCAN_TYPES,
  SCAN_STATUS,
  ALERT_STATUS,
  ALERT_TYPES,
  MONITORING_EVENT_TYPES,
  MONITORING_EVENT_STATUS,
  EXPIRY_THRESHOLDS,
  SEVERITY_LEVELS
} = require('../constants');
const { addScanJob } = require('./queue.service');
const { fetchSslCertificateInfo } = require('./ssl.service');
const { fetchDomainExpiryInfo } = require('./domainExpiry.service');
const alertService = require('./alert.service');
const emailService = require('./email.service');
const logger = require('../config/logger');

function assertWorkspaceId(workspaceId) {
  if (!workspaceId) {
    const error = new Error('Workspace ID context required');
    error.statusCode = 400;
    throw error;
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(date) {
  if (!date) return null;
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function recordEvent({ workspaceId = null, domainId = null, type, status, message, metadata = {} }) {
  return MonitoringEvent.create({
    workspaceId,
    domainId,
    type,
    status,
    message,
    metadata
  });
}

function getMonitoredDomainsFilter() {
  return {
    verificationStatus: DOMAIN_VERIFICATION_STATUS.VERIFIED,
    monitoringEnabled: { $ne: false },
    status: { $in: ['Active', 'Needs Attention'] }
  };
}

async function runSslCheckForDomain(domainDoc) {
  const sslInfo = await fetchSslCertificateInfo(domainDoc.domain);

  domainDoc.sslLastCheckedAt = new Date();
  domainDoc.sslIssuer = sslInfo.issuer || domainDoc.sslIssuer;

  if (sslInfo.expiryDate) {
    domainDoc.sslExpiryDate = sslInfo.expiryDate;
  }

  await domainDoc.save();

  if (sslInfo.severity && sslInfo.tier && sslInfo.tier !== 'ok') {
    await alertService.createSslExpiryAlert(domainDoc, sslInfo);
  }

  await recordEvent({
    workspaceId: domainDoc.workspaceId,
    domainId: domainDoc._id,
    type: MONITORING_EVENT_TYPES.SSL_CHECK,
    status: sslInfo.success ? MONITORING_EVENT_STATUS.SUCCESS : MONITORING_EVENT_STATUS.WARNING,
    message: sslInfo.success
      ? `SSL check completed for ${domainDoc.domain}`
      : `SSL check issue for ${domainDoc.domain}: ${sslInfo.error}`,
    metadata: {
      daysRemaining: sslInfo.daysRemaining,
      tier: sslInfo.tier,
      expiryDate: sslInfo.expiryDate
    }
  });

  return sslInfo;
}

async function runDomainExpiryCheckForDomain(domainDoc) {
  const expiryInfo = await fetchDomainExpiryInfo(domainDoc.domain);

  domainDoc.domainLastCheckedAt = new Date();
  domainDoc.domainRegistrar = expiryInfo.registrar || domainDoc.domainRegistrar;

  if (expiryInfo.expiryDate) {
    domainDoc.domainExpiryDate = expiryInfo.expiryDate;
  }

  await domainDoc.save();

  if (expiryInfo.severity && expiryInfo.tier && expiryInfo.tier !== 'ok') {
    await alertService.createDomainExpiryAlert(domainDoc, expiryInfo);
  }

  await recordEvent({
    workspaceId: domainDoc.workspaceId,
    domainId: domainDoc._id,
    type: MONITORING_EVENT_TYPES.DOMAIN_EXPIRY_CHECK,
    status: expiryInfo.success ? MONITORING_EVENT_STATUS.SUCCESS : MONITORING_EVENT_STATUS.WARNING,
    message: expiryInfo.success
      ? `Domain expiry check completed for ${domainDoc.domain}`
      : `Domain expiry check issue for ${domainDoc.domain}: ${expiryInfo.error}`,
    metadata: {
      daysRemaining: expiryInfo.daysRemaining,
      tier: expiryInfo.tier,
      expiryDate: expiryInfo.expiryDate
    }
  });

  return expiryInfo;
}

async function scheduleScanForDomain(domainDoc) {
  const todayStart = startOfToday();
  const existingScan = await Scan.findOne({
    workspaceId: domainDoc.workspaceId,
    domainId: domainDoc._id,
    triggeredBy: 'system',
    createdAt: { $gte: todayStart }
  }).sort({ createdAt: -1 });

  if (existingScan) {
    return { skipped: true, reason: 'already_scheduled_today', scan: existingScan };
  }

  const checks = {
    owasp: true,
    ssl: true,
    headers: true,
    ports: true,
    malware: true,
    compliance: true
  };

  const scan = await Scan.create({
    workspaceId: domainDoc.workspaceId,
    domainId: domainDoc._id,
    scanType: SCAN_TYPES.FULL,
    status: SCAN_STATUS.QUEUED,
    triggeredBy: 'system',
    scheduledTime: new Date(),
    checks
  });

  await addScanJob(scan._id, domainDoc.domain, checks);

  await recordEvent({
    workspaceId: domainDoc.workspaceId,
    domainId: domainDoc._id,
    type: MONITORING_EVENT_TYPES.DAILY_SCAN,
    status: MONITORING_EVENT_STATUS.SUCCESS,
    message: `Scheduled daily scan for ${domainDoc.domain}`,
    metadata: { scanId: scan._id }
  });

  return { skipped: false, scan };
}

async function runDailyScansForAllDomains() {
  logger.info('runDailyScansForAllDomains() started');

  const domains = await Domain.find(getMonitoredDomainsFilter());
  logger.info(`runDailyScansForAllDomains() processing ${domains.length} domain(s)`);

  const results = { scheduled: 0, skipped: 0, failed: 0 };

  for (const domain of domains) {
    try {
      const outcome = await scheduleScanForDomain(domain);
      if (outcome.skipped) {
        results.skipped += 1;
      } else {
        results.scheduled += 1;
      }
    } catch (error) {
      results.failed += 1;
      logger.error(`Daily scan scheduling failed for ${domain.domain}: ${error.message}`);
      await recordEvent({
        workspaceId: domain.workspaceId,
        domainId: domain._id,
        type: MONITORING_EVENT_TYPES.DAILY_SCAN,
        status: MONITORING_EVENT_STATUS.FAILED,
        message: `Failed to schedule daily scan for ${domain.domain}`,
        metadata: { error: error.message }
      });
    }
  }

  logger.info(
    `runDailyScansForAllDomains() completed — scheduled: ${results.scheduled}, skipped: ${results.skipped}, failed: ${results.failed}`
  );

  return results;
}

async function runSslChecksForAllDomains() {
  logger.info('runSslChecksForAllDomains() started');

  const domains = await Domain.find(getMonitoredDomainsFilter());
  logger.info(`runSslChecksForAllDomains() processing ${domains.length} domain(s)`);

  const results = { checked: 0, warnings: 0, failed: 0 };

  for (const domain of domains) {
    try {
      const sslInfo = await runSslCheckForDomain(domain);
      results.checked += 1;
      if (sslInfo.tier && sslInfo.tier !== 'ok') {
        results.warnings += 1;
      }
    } catch (error) {
      results.failed += 1;
      logger.error(`SSL monitoring failed for ${domain.domain}: ${error.message}`);
    }
  }

  logger.info(
    `runSslChecksForAllDomains() completed — checked: ${results.checked}, warnings: ${results.warnings}, failed: ${results.failed}`
  );

  return results;
}

async function runDomainExpiryChecksForAllDomains() {
  logger.info('runDomainExpiryChecksForAllDomains() started');

  const domains = await Domain.find(getMonitoredDomainsFilter());
  logger.info(`runDomainExpiryChecksForAllDomains() processing ${domains.length} domain(s)`);

  const results = { checked: 0, warnings: 0, failed: 0 };

  for (const domain of domains) {
    try {
      const expiryInfo = await runDomainExpiryCheckForDomain(domain);
      results.checked += 1;
      if (expiryInfo.tier && expiryInfo.tier !== 'ok') {
        results.warnings += 1;
      }
    } catch (error) {
      results.failed += 1;
      logger.error(`Domain expiry monitoring failed for ${domain.domain}: ${error.message}`);
    }
  }

  logger.info(
    `runDomainExpiryChecksForAllDomains() completed — checked: ${results.checked}, warnings: ${results.warnings}, failed: ${results.failed}`
  );

  return results;
}

async function sendDailySummaries() {
  const workspaces = await Workspace.find().select('name notifications owner').lean();
  const todayStart = startOfToday();
  const summaries = [];

  for (const workspace of workspaces) {
    const workspaceId = workspace._id;
    const domainsScanned = await Scan.countDocuments({
      workspaceId,
      triggeredBy: 'system',
      createdAt: { $gte: todayStart }
    });

    const alertsCreated = await Alert.countDocuments({
      workspaceId,
      createdAt: { $gte: todayStart }
    });

    const sslWarnings = await Alert.countDocuments({
      workspaceId,
      type: ALERT_TYPES.SSL_EXPIRY,
      createdAt: { $gte: todayStart }
    });

    const domainWarnings = await Alert.countDocuments({
      workspaceId,
      type: ALERT_TYPES.DOMAIN_EXPIRY,
      createdAt: { $gte: todayStart }
    });

    const criticalFindings = await Alert.countDocuments({
      workspaceId,
      type: ALERT_TYPES.CRITICAL_FINDING,
      createdAt: { $gte: todayStart }
    });

    const recipients = await alertService.getWorkspaceRecipients(workspaceId);
    const template = emailService.templateDailySummary({
      workspaceName: workspace.name,
      domainsScanned,
      alertsCreated,
      sslWarnings,
      domainWarnings,
      criticalFindings
    });

    if (recipients.length) {
      await emailService.sendEmail({
        to: recipients,
        subject: template.subject,
        html: template.html
      });
    }

    await recordEvent({
      workspaceId,
      type: MONITORING_EVENT_TYPES.DAILY_SUMMARY,
      status: MONITORING_EVENT_STATUS.SUCCESS,
      message: `Daily monitoring summary generated for ${workspace.name}`,
      metadata: {
        domainsScanned,
        alertsCreated,
        sslWarnings,
        domainWarnings,
        criticalFindings
      }
    });

    summaries.push({
      workspaceId,
      workspaceName: workspace.name,
      domainsScanned,
      alertsCreated,
      sslWarnings,
      domainWarnings,
      criticalFindings
    });
  }

  return summaries;
}

async function runFullMonitoringCycle() {
  logger.info('runFullMonitoringCycle() started');

  logger.info('runFullMonitoringCycle() executing daily scans');
  const scanResults = await runDailyScansForAllDomains();

  logger.info('runFullMonitoringCycle() executing SSL checks');
  const sslResults = await runSslChecksForAllDomains();

  logger.info('runFullMonitoringCycle() executing domain expiry checks');
  const domainResults = await runDomainExpiryChecksForAllDomains();

  logger.info('runFullMonitoringCycle() sending daily summaries');
  const summaries = await sendDailySummaries();

  logger.info('runFullMonitoringCycle() completed');

  return { scanResults, sslResults, domainResults, summaries };
}

function mapDomainMonitorRow(domain) {
  const sslDays = daysUntil(domain.sslExpiryDate);
  const domainDays = daysUntil(domain.domainExpiryDate);

  return {
    id: domain._id,
    domain: domain.domain,
    status: domain.status,
    score: domain.score,
    scoreLabel: domain.scoreLabel,
    lastScanAt: domain.lastScanAt,
    sslExpiryDate: domain.sslExpiryDate,
    sslDaysRemaining: sslDays,
    sslIssuer: domain.sslIssuer,
    sslLastCheckedAt: domain.sslLastCheckedAt,
    domainExpiryDate: domain.domainExpiryDate,
    domainDaysRemaining: domainDays,
    domainRegistrar: domain.domainRegistrar,
    domainLastCheckedAt: domain.domainLastCheckedAt,
    monitoringEnabled: domain.monitoringEnabled !== false
  };
}

function isExpiringSoon(daysRemaining) {
  return daysRemaining !== null && daysRemaining <= EXPIRY_THRESHOLDS.WARNING_DAYS;
}

async function getMonitoringOverview(workspaceId) {
  assertWorkspaceId(workspaceId);

  const domainFilter = { workspaceId, ...getMonitoredDomainsFilter() };
  const domains = await Domain.find(domainFilter).sort({ domain: 1 });
  const activeAlerts = await Alert.countDocuments({
    workspaceId,
    status: ALERT_STATUS.ACTIVE
  });
  const criticalAlerts = await Alert.countDocuments({
    workspaceId,
    status: ALERT_STATUS.ACTIVE,
    severity: SEVERITY_LEVELS.CRITICAL
  });

  const sslExpiringSoon = domains.filter((domain) =>
    isExpiringSoon(daysUntil(domain.sslExpiryDate))
  ).length;
  const domainsExpiringSoon = domains.filter((domain) =>
    isExpiringSoon(daysUntil(domain.domainExpiryDate))
  ).length;

  const lastDailyScanEvent = await MonitoringEvent.findOne({
    workspaceId,
    type: MONITORING_EVENT_TYPES.DAILY_SCAN
  }).sort({ createdAt: -1 });

  const recentEvents = await MonitoringEvent.find({ workspaceId })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('domainId', 'domain');

  let status = 'operational';
  if (criticalAlerts > 0) {
    status = 'critical';
  } else if (activeAlerts > 0 || sslExpiringSoon > 0 || domainsExpiringSoon > 0) {
    status = 'attention';
  }

  return {
    status,
    summary: {
      verifiedDomains: domains.length,
      sslExpiringSoon,
      domainsExpiringSoon,
      activeAlerts,
      criticalAlerts,
      lastDailyScanAt: lastDailyScanEvent?.createdAt || null,
      emailConfigured: emailService.isEmailConfigured(),
      monitoringEnabled: process.env.MONITORING_ENABLED !== 'false'
    },
    recentEvents,
    monitoredDomains: domains.map(mapDomainMonitorRow)
  };
}

async function getSslMonitoring(workspaceId) {
  assertWorkspaceId(workspaceId);

  const domains = await Domain.find({
    workspaceId,
    verificationStatus: DOMAIN_VERIFICATION_STATUS.VERIFIED
  }).sort({ sslExpiryDate: 1 });

  const items = domains.map((domain) => {
    const daysRemaining = daysUntil(domain.sslExpiryDate);
    let risk = 'healthy';

    if (daysRemaining !== null && daysRemaining < 0) risk = 'critical';
    else if (daysRemaining !== null && daysRemaining <= EXPIRY_THRESHOLDS.HIGH_DAYS) risk = 'high';
    else if (daysRemaining !== null && daysRemaining <= EXPIRY_THRESHOLDS.WARNING_DAYS) risk = 'warning';

    return {
      ...mapDomainMonitorRow(domain),
      risk
    };
  });

  return {
    expiringSoon: items.filter((item) => isExpiringSoon(item.sslDaysRemaining)),
    all: items
  };
}

async function getDomainExpiryMonitoring(workspaceId) {
  assertWorkspaceId(workspaceId);

  const domains = await Domain.find({
    workspaceId,
    verificationStatus: DOMAIN_VERIFICATION_STATUS.VERIFIED
  }).sort({ domainExpiryDate: 1 });

  const items = domains.map((domain) => {
    const daysRemaining = daysUntil(domain.domainExpiryDate);
    let risk = 'healthy';

    if (daysRemaining !== null && daysRemaining < 0) risk = 'critical';
    else if (daysRemaining !== null && daysRemaining <= EXPIRY_THRESHOLDS.HIGH_DAYS) risk = 'high';
    else if (daysRemaining !== null && daysRemaining <= EXPIRY_THRESHOLDS.WARNING_DAYS) risk = 'warning';

    return {
      ...mapDomainMonitorRow(domain),
      risk
    };
  });

  return {
    expiringSoon: items.filter((item) => isExpiringSoon(item.domainDaysRemaining)),
    all: items
  };
}

module.exports = {
  runDailyScansForAllDomains,
  runSslChecksForAllDomains,
  runDomainExpiryChecksForAllDomains,
  sendDailySummaries,
  runFullMonitoringCycle,
  runSslCheckForDomain,
  runDomainExpiryCheckForDomain,
  scheduleScanForDomain,
  getMonitoringOverview,
  getSslMonitoring,
  getDomainExpiryMonitoring,
  recordEvent
};
