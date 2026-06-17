const logger = require('../../config/logger');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_DOMAINS_ENDPOINT = 'https://api.resend.com/domains';
const DEFAULT_SENDER = 'noreply@yourdomain.com';

let lastEmailStatus = {
  lastEmailAttempt: null,
  lastEmailError: null,
  lastEmailSuccess: null,
};

function getFrontendInviteBaseUrl() {
  return process.env.FRONTEND_INVITE_BASE_URL || 'https://breach-radar-frontend.vercel.app/invite';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildInvitationEmail({ organizationName, role, token, expiresAt }) {
  const acceptUrl = buildInvitationLink(token);
  const expiry = formatDate(expiresAt);

  return {
    subject: "You've been invited to join Breach Radar",
    html: `
      <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
        <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
          <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">You've been invited to join Breach Radar</h1>
          <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6">You have been invited to collaborate in an organization on Breach Radar.</p>
          <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
            <p style="margin:0 0 8px;color:#aeb8c7">Organization</p>
            <strong style="display:block;margin-bottom:16px;font-size:18px;color:#ffffff">${organizationName}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7">Role Assigned</p>
            <strong style="display:block;margin-bottom:16px;color:#16e095">${role}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7">Invitation Expires</p>
            <strong style="display:block;color:#ffffff">${expiry}</strong>
          </div>
          <a href="${acceptUrl}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:13px 18px;border-radius:8px">Accept Invitation</a>
          <p style="margin:24px 0 0;color:#aeb8c7;font-size:13px;line-height:1.6">If the button does not work, copy and paste this link into your browser:<br>${acceptUrl}</p>
        </div>
      </div>
    `,
    text: [
      "You've been invited to join Breach Radar",
      `Organization: ${organizationName}`,
      `Role Assigned: ${role}`,
      `Invitation Expires: ${expiry}`,
      `Accept Invitation: ${acceptUrl}`,
    ].join('\n'),
  };
}

function buildInvitationLink(token) {
  return `${getFrontendInviteBaseUrl()}/${token}`;
}

function getSenderEmail() {
  return process.env.EMAIL_FROM || process.env.FROM_EMAIL || DEFAULT_SENDER;
}

function maskEmailPayload(payload) {
  return {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    hasHtml: Boolean(payload.html),
    hasText: Boolean(payload.text),
  };
}

function updateLastEmailStatus({ success, error = null }) {
  lastEmailStatus = {
    lastEmailAttempt: new Date().toISOString(),
    lastEmailError: error,
    lastEmailSuccess: success,
  };
}

function getEmailStatus() {
  const senderEmail = getSenderEmail();
  return {
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    senderEmail,
    resendMode: senderEmail.endsWith('@resend.dev') ? 'test' : 'production',
    ...lastEmailStatus,
  };
}

function buildEmailError(payload, responseStatus) {
  const resendMessage = payload.message || payload.error || 'Resend email delivery failed.';
  const error = new Error(resendMessage);
  error.statusCode = responseStatus;
  error.code = payload.name || payload.code || 'RESEND_DELIVERY_FAILED';
  error.details = payload;
  return error;
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getSenderEmail();
  const emailPayload = { from, to, subject, html, text };

  logger.info(`[team-invite-email] Email payload generated: ${JSON.stringify(maskEmailPayload(emailPayload))}`);

  if (!apiKey) {
    const reason = 'RESEND_API_KEY missing';
    updateLastEmailStatus({ success: false, error: reason });
    logger.warn(`[team-invite-email] ${reason}. Email to ${to} was not sent.`);
    const error = new Error('Email provider is not configured. Invitation was created but email was not sent.');
    error.statusCode = 503;
    error.code = 'RESEND_API_KEY_MISSING';
    throw error;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  const payload = await response.json().catch(() => ({}));
  logger.info(`[team-invite-email] Resend API response: ${JSON.stringify({
    ok: response.ok,
    status: response.status,
    id: payload.id,
    name: payload.name,
    message: payload.message,
  })}`);

  if (!response.ok) {
    const error = buildEmailError(payload, response.status);
    updateLastEmailStatus({ success: false, error: error.message });
    logger.error(`[team-invite-email] Email delivery failed for ${to}: ${error.message}`);
    throw error;
  }

  updateLastEmailStatus({ success: true });
  logger.info(`[team-invite-email] Email delivery accepted by Resend for ${to}. Message id: ${payload.id || 'unknown'}`);
  return payload;
}

async function sendInvitationEmail({ to, organizationName, role, token, expiresAt }) {
  const template = buildInvitationEmail({ organizationName, role, token, expiresAt });
  return sendEmail({ to, ...template });
}

async function verifySenderDomainStatus() {
  const apiKey = process.env.RESEND_API_KEY;
  const senderEmail = getSenderEmail();
  const senderDomain = senderEmail.split('@')[1] || '';

  if (!apiKey) {
    return {
      configured: false,
      senderEmail,
      senderDomain,
      verified: false,
      reason: 'RESEND_API_KEY missing',
    };
  }

  if (!senderDomain || senderDomain === 'resend.dev') {
    return {
      configured: true,
      senderEmail,
      senderDomain,
      verified: senderDomain === 'resend.dev',
      reason: senderDomain === 'resend.dev' ? 'Using Resend onboarding sender.' : 'Sender email is invalid.',
    };
  }

  const response = await fetch(RESEND_DOMAINS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      configured: true,
      senderEmail,
      senderDomain,
      verified: false,
      reason: payload.message || 'Could not verify sender domain through Resend.',
      statusCode: response.status,
    };
  }

  const domains = Array.isArray(payload.data) ? payload.data : [];
  const match = domains.find((domain) => domain.name === senderDomain);

  return {
    configured: true,
    senderEmail,
    senderDomain,
    verified: Boolean(match && match.status === 'verified'),
    status: match?.status || 'not_found',
    reason: match ? `Resend domain status is ${match.status}.` : 'Sender domain is not present in Resend verified domains.',
  };
}

module.exports = {
  sendInvitationEmail,
  buildInvitationEmail,
  buildInvitationLink,
  getEmailStatus,
  verifySenderDomainStatus,
};
