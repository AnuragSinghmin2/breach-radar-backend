const logger = require('../../config/logger');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
  const acceptUrl = `${getFrontendInviteBaseUrl()}/${token}`;
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

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'noreply@yourdomain.com';

  if (!apiKey) {
    logger.warn(`RESEND_API_KEY is not configured. Email to ${to} was not sent.`);
    return { skipped: true, reason: 'RESEND_API_KEY missing' };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Resend email delivery failed.');
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function sendInvitationEmail({ to, organizationName, role, token, expiresAt }) {
  const template = buildInvitationEmail({ organizationName, role, token, expiresAt });
  return sendEmail({ to, ...template });
}

module.exports = {
  sendInvitationEmail,
  buildInvitationEmail,
};
