const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isEmailConfigured()) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

function buildBaseTemplate({ title, intro, rows = [], footer }) {
  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:160px;">${row.label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${row.value}</td>
        </tr>`
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="background:#0f172a;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Breach Radar</h1>
          <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;">${title}</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;color:#334155;line-height:1.6;">${intro}</p>
          ${
            rows.length
              ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${rowHtml}</table>`
              : ''
          }
          <p style="margin:16px 0 0;color:#64748b;font-size:13px;">${footer || 'Sign in to your Breach Radar dashboard to review details and take action.'}</p>
        </div>
      </div>
    </div>
  `;
}

function templateSslExpiryWarning({ domain, daysRemaining, expiryDate, severity }) {
  const title = severity === 'Critical' ? 'SSL Certificate Expired' : 'SSL Expiry Warning';
  const intro =
    daysRemaining < 0
      ? `The SSL certificate for <strong>${domain}</strong> has expired.`
      : `The SSL certificate for <strong>${domain}</strong> expires in <strong>${daysRemaining}</strong> day(s).`;

  return {
    subject: `[Breach Radar] ${title}: ${domain}`,
    html: buildBaseTemplate({
      title,
      intro,
      rows: [
        { label: 'Domain', value: domain },
        { label: 'Severity', value: severity },
        { label: 'Expiry Date', value: expiryDate ? new Date(expiryDate).toUTCString() : 'Unknown' },
        { label: 'Days Remaining', value: daysRemaining ?? 'Unknown' }
      ]
    })
  };
}

function templateDomainExpiryWarning({ domain, daysRemaining, expiryDate, registrar, severity }) {
  const title = severity === 'Critical' ? 'Domain Registration Expired' : 'Domain Expiry Warning';
  const intro =
    daysRemaining < 0
      ? `The domain registration for <strong>${domain}</strong> appears to be expired.`
      : `The domain registration for <strong>${domain}</strong> expires in <strong>${daysRemaining}</strong> day(s).`;

  return {
    subject: `[Breach Radar] ${title}: ${domain}`,
    html: buildBaseTemplate({
      title,
      intro,
      rows: [
        { label: 'Domain', value: domain },
        { label: 'Registrar', value: registrar || 'Unknown' },
        { label: 'Severity', value: severity },
        { label: 'Expiry Date', value: expiryDate ? new Date(expiryDate).toUTCString() : 'Unknown' },
        { label: 'Days Remaining', value: daysRemaining ?? 'Unknown' }
      ]
    })
  };
}

function templateCriticalFindings({ workspaceName, domain, criticalCount, highCount, scanId }) {
  return {
    subject: `[Breach Radar] Critical Security Findings: ${domain}`,
    html: buildBaseTemplate({
      title: 'Critical Security Findings',
      intro: `A scheduled scan detected high-priority vulnerabilities for <strong>${domain}</strong> in workspace <strong>${workspaceName}</strong>.`,
      rows: [
        { label: 'Domain', value: domain },
        { label: 'Critical Findings', value: String(criticalCount) },
        { label: 'High Findings', value: String(highCount) },
        { label: 'Scan ID', value: String(scanId) }
      ]
    })
  };
}

function templateDailySummary({
  workspaceName,
  domainsScanned,
  alertsCreated,
  sslWarnings,
  domainWarnings,
  criticalFindings
}) {
  return {
    subject: `[Breach Radar] Daily Monitoring Summary — ${workspaceName}`,
    html: buildBaseTemplate({
      title: 'Daily Monitoring Summary',
      intro: `Your daily Breach Radar monitoring run has completed for workspace <strong>${workspaceName}</strong>.`,
      rows: [
        { label: 'Domains Scanned', value: String(domainsScanned) },
        { label: 'New Alerts', value: String(alertsCreated) },
        { label: 'SSL Warnings', value: String(sslWarnings) },
        { label: 'Domain Expiry Warnings', value: String(domainWarnings) },
        { label: 'Critical Findings', value: String(criticalFindings) }
      ],
      footer: 'Review the monitoring dashboard for full details.'
    })
  };
}

async function sendEmail({ to, subject, html }) {
  const mailer = getTransporter();

  if (!mailer) {
    logger.warn(`Email not configured — skipped: ${subject} → ${to}`);
    return { sent: false, reason: 'email_not_configured' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const filtered = recipients.filter(Boolean);

  if (!filtered.length) {
    return { sent: false, reason: 'no_recipients' };
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: filtered.join(', '),
    subject,
    html
  });

  logger.info(`Monitoring email sent: ${subject} → ${filtered.join(', ')}`);
  return { sent: true };
}

module.exports = {
  isEmailConfigured,
  sendEmail,
  templateSslExpiryWarning,
  templateDomainExpiryWarning,
  templateCriticalFindings,
  templateDailySummary
};
