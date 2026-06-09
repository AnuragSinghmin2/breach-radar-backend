const Alert = require('../models/Alert');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const {
  ALERT_TYPES,
  ALERT_STATUS,
  SEVERITY_LEVELS
} = require('../constants');
const emailService = require('./email.service');
const { addAlertJob } = require('./queue.service');
const logger = require('../config/logger');

const SEVERITY_RANK = {
  [SEVERITY_LEVELS.LOW]: 1,
  [SEVERITY_LEVELS.MEDIUM]: 2,
  [SEVERITY_LEVELS.HIGH]: 3,
  [SEVERITY_LEVELS.CRITICAL]: 4
};

async function getWorkspaceRecipients(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) return [];

  const recipients = new Set(
    (workspace.notifications?.channels?.email?.recipients || []).filter(Boolean)
  );

  const owner = await User.findById(workspace.owner).select('email').lean();
  if (owner?.email) {
    recipients.add(owner.email);
  }

  return Array.from(recipients);
}

async function upsertAlert({
  workspaceId,
  domainId = null,
  scanId = null,
  type,
  severity,
  title,
  message,
  dedupeKey,
  metadata = {},
  sendEmail = true,
  emailTemplate = null
}) {
  const existing = await Alert.findOne({
    workspaceId,
    dedupeKey,
    status: { $in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] }
  }).sort({ createdAt: -1 });

  if (existing) {
    const shouldEscalate =
      SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity];

    if (!shouldEscalate) {
      return { alert: existing, created: false };
    }

    existing.severity = severity;
    existing.title = title;
    existing.message = message;
    existing.metadata = { ...existing.metadata, ...metadata };
    existing.status = ALERT_STATUS.ACTIVE;
    existing.acknowledgedAt = null;
    existing.acknowledgedBy = null;
    await existing.save();

    if (sendEmail && emailTemplate) {
      await dispatchAlertEmail(existing, emailTemplate);
    }

    return { alert: existing, created: false, escalated: true };
  }

  const alert = await Alert.create({
    workspaceId,
    domainId,
    scanId,
    type,
    severity,
    title,
    message,
    dedupeKey,
    metadata,
    status: ALERT_STATUS.ACTIVE
  });

  if (sendEmail && emailTemplate) {
    await dispatchAlertEmail(alert, emailTemplate);
  } else if (sendEmail) {
    await queueAlertDispatch(alert._id);
  }

  return { alert, created: true };
}

async function dispatchAlertEmail(alert, emailTemplate) {
  try {
    const recipients = await getWorkspaceRecipients(alert.workspaceId);
    if (!recipients.length) return;

    const { subject, html } = emailTemplate;
    const result = await emailService.sendEmail({ to: recipients, subject, html });

    if (result.sent) {
      alert.emailSent = true;
      alert.emailSentAt = new Date();
      await alert.save();
    }
  } catch (error) {
    logger.error(`Failed to send alert email for ${alert._id}: ${error.message}`);
  }
}

async function queueAlertDispatch(alertId) {
  try {
    await addAlertJob('monitoring-alert', { alertId: String(alertId) });
  } catch (error) {
    logger.warn(`Alert queue unavailable for ${alertId}: ${error.message}`);
  }
}

async function createSslExpiryAlert(domain, sslInfo) {
  if (!sslInfo.tier || sslInfo.tier === 'ok') {
    return null;
  }

  const daysRemaining = sslInfo.daysRemaining ?? 'unknown';
  const title =
    sslInfo.tier === 'expired'
      ? `SSL certificate expired for ${domain.domain}`
      : `SSL certificate expiring soon for ${domain.domain}`;

  const message =
    sslInfo.tier === 'expired'
      ? `The TLS certificate for ${domain.domain} has expired.`
      : `The TLS certificate for ${domain.domain} expires in ${daysRemaining} day(s).`;

  const emailTemplate = emailService.templateSslExpiryWarning({
    domain: domain.domain,
    daysRemaining: sslInfo.daysRemaining,
    expiryDate: sslInfo.expiryDate,
    severity: sslInfo.severity
  });

  return upsertAlert({
    workspaceId: domain.workspaceId,
    domainId: domain._id,
    type: ALERT_TYPES.SSL_EXPIRY,
    severity: sslInfo.severity,
    title,
    message,
    dedupeKey: `ssl:${domain._id}:${sslInfo.tier}`,
    metadata: {
      expiryDate: sslInfo.expiryDate,
      daysRemaining: sslInfo.daysRemaining,
      issuer: sslInfo.issuer
    },
    emailTemplate
  });
}

async function createDomainExpiryAlert(domain, expiryInfo) {
  if (!expiryInfo.tier || expiryInfo.tier === 'ok') {
    return null;
  }

  const daysRemaining = expiryInfo.daysRemaining ?? 'unknown';
  const title =
    expiryInfo.tier === 'expired'
      ? `Domain registration expired for ${domain.domain}`
      : `Domain registration expiring soon for ${domain.domain}`;

  const message =
    expiryInfo.tier === 'expired'
      ? `The domain registration for ${domain.domain} appears to be expired.`
      : `The domain registration for ${domain.domain} expires in ${daysRemaining} day(s).`;

  const emailTemplate = emailService.templateDomainExpiryWarning({
    domain: domain.domain,
    daysRemaining: expiryInfo.daysRemaining,
    expiryDate: expiryInfo.expiryDate,
    registrar: expiryInfo.registrar,
    severity: expiryInfo.severity
  });

  return upsertAlert({
    workspaceId: domain.workspaceId,
    domainId: domain._id,
    type: ALERT_TYPES.DOMAIN_EXPIRY,
    severity: expiryInfo.severity,
    title,
    message,
    dedupeKey: `domain:${domain._id}:${expiryInfo.tier}`,
    metadata: {
      expiryDate: expiryInfo.expiryDate,
      daysRemaining: expiryInfo.daysRemaining,
      registrar: expiryInfo.registrar
    },
    emailTemplate
  });
}

async function handleScanCompletedAlerts(scan, domain, counts) {
  if (!counts.critical && !counts.high) {
    return null;
  }

  const workspace = await Workspace.findById(scan.workspaceId).select('name').lean();
  const severity = counts.critical > 0 ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.HIGH;

  const emailTemplate = emailService.templateCriticalFindings({
    workspaceName: workspace?.name || 'Workspace',
    domain: domain.domain,
    criticalCount: counts.critical,
    highCount: counts.high,
    scanId: scan._id
  });

  return upsertAlert({
    workspaceId: scan.workspaceId,
    domainId: domain._id,
    scanId: scan._id,
    type: ALERT_TYPES.CRITICAL_FINDING,
    severity,
    title: `Security findings detected on ${domain.domain}`,
    message: `Scan completed with ${counts.critical} critical and ${counts.high} high severity findings.`,
    dedupeKey: `scan:${scan._id}:findings`,
    metadata: { counts },
    emailTemplate
  });
}

async function acknowledgeAlert(workspaceId, alertId, userId) {
  const alert = await Alert.findOne({ _id: alertId, workspaceId });
  if (!alert) {
    const error = new Error('Alert not found.');
    error.statusCode = 404;
    throw error;
  }

  alert.status = ALERT_STATUS.ACKNOWLEDGED;
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = userId;
  await alert.save();
  return alert;
}

async function getAlerts(workspaceId, filters = {}) {
  const query = { workspaceId };

  if (filters.status && filters.status !== 'All') {
    query.status = filters.status;
  }

  if (filters.type) {
    query.type = filters.type;
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);

  return Alert.find(query)
    .populate('domainId', 'domain score status')
    .sort({ createdAt: -1 })
    .limit(limit);
}

module.exports = {
  upsertAlert,
  createSslExpiryAlert,
  createDomainExpiryAlert,
  handleScanCompletedAlerts,
  acknowledgeAlert,
  getAlerts,
  getWorkspaceRecipients,
  dispatchAlertEmail
};
