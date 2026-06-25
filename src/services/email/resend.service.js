const logger = require('../../config/logger');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_DOMAINS_ENDPOINT = 'https://api.resend.com/domains';

// FIX: onboarding@resend.dev is Resend's official test sender - works without domain verification
const DEFAULT_SENDER = 'onboarding@resend.dev';

let lastEmailStatus = {
  lastEmailAttempt: null,
  lastEmailError: null,
  lastEmailSuccess: null,
};

function getFrontendInviteBaseUrl() {
  return process.env.FRONTEND_INVITE_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173/invite';
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

function getSenderEmail() {
  const sender = process.env.EMAIL_FROM || process.env.FROM_EMAIL || DEFAULT_SENDER;
  // Safety: if someone left a gmail/non-resend address, fall back to test sender
  if (sender.includes('gmail.com') || sender.includes('.local') || sender === 'noreply@yourdomain.com') {
    logger.warn(`[email] Invalid sender "${sender}" detected — falling back to ${DEFAULT_SENDER}`);
    return DEFAULT_SENDER;
  }
  return sender;
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

// ─── CORE sendEmail FUNCTION ───────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getSenderEmail();
  const emailPayload = { from, to, subject, html, text };

  logger.info(`[email] Sending: ${JSON.stringify(maskEmailPayload(emailPayload))}`);

  if (!apiKey) {
    const reason = 'RESEND_API_KEY missing in .env';
    updateLastEmailStatus({ success: false, error: reason });
    logger.warn(`[email] ${reason}. Email to ${to} was NOT sent.`);
    const error = new Error('Email provider is not configured. Please set RESEND_API_KEY in .env');
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
  logger.info(`[email] Resend API response: ${JSON.stringify({
    ok: response.ok,
    status: response.status,
    id: payload.id,
    name: payload.name,
    message: payload.message,
  })}`);

  if (!response.ok) {
    const error = buildEmailError(payload, response.status);
    updateLastEmailStatus({ success: false, error: error.message });
    logger.error(`[email] Delivery FAILED for ${to}: ${error.message}`);
    throw error;
  }

  updateLastEmailStatus({ success: true });
  logger.info(`[email] Delivered to ${to}. Resend ID: ${payload.id || 'unknown'}`);
  return payload;
}

// ─── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

// Template 1: Team Invitation
function buildInvitationEmail({ organizationName, role, token, expiresAt }) {
  const acceptUrl = buildInvitationLink(token);
  const expiry = formatDate(expiresAt);

  return {
    subject: "You've been invited to join Breach Radar",
    html: `
      <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
        <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
            <div style="width:36px;height:36px;background:#16e095;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#04120d;font-size:18px">B</div>
            <span style="font-size:20px;font-weight:900;color:#ffffff">Breach Radar</span>
          </div>
          <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">You've been invited!</h1>
          <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6">You have been invited to collaborate in an organization on Breach Radar.</p>
          <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Organization</p>
            <strong style="display:block;margin-bottom:16px;font-size:18px;color:#ffffff">${organizationName}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Role Assigned</p>
            <strong style="display:block;margin-bottom:16px;color:#16e095;font-size:16px">${role}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Invitation Expires</p>
            <strong style="display:block;color:#ffffff">${expiry}</strong>
          </div>
          <a href="${acceptUrl}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:8px;font-size:16px">
            Accept Invitation →
          </a>
          <p style="margin:24px 0 0;color:#aeb8c7;font-size:13px;line-height:1.6">
            If the button does not work, copy this link:<br>
            <a href="${acceptUrl}" style="color:#16e095">${acceptUrl}</a>
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #20324a">
          <p style="margin:0;color:#6b7a8d;font-size:12px">If you did not expect this invitation, you can safely ignore this email.</p>
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

// Template 2: Welcome Email
function buildWelcomeEmail({ name }) {
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return {
    subject: 'Welcome to Breach Radar — Your account is ready!',
    html: `
      <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
        <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
          <div style="text-align:center;margin-bottom:28px">
            <div style="width:64px;height:64px;background:#16e095;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#04120d;font-size:32px;margin-bottom:16px">B</div>
            <h1 style="margin:0;font-size:26px;color:#ffffff">Welcome to Breach Radar!</h1>
          </div>
          <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6;font-size:16px">
            Hi <strong style="color:#ffffff">${name}</strong>,<br><br>
            Your account is ready. Start securing your digital assets today.
          </p>
          <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
            <p style="margin:0 0 12px;color:#ffffff;font-weight:700;font-size:15px">What you can do with Breach Radar:</p>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:14px">✅ Scan domains for vulnerabilities</p>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:14px">✅ Monitor SSL certificates & domain expiry</p>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:14px">✅ Get real-time security alerts</p>
            <p style="margin:0;color:#aeb8c7;font-size:14px">✅ Generate professional security reports</p>
          </div>
          <a href="${loginUrl}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:8px;font-size:16px">
            Go to Dashboard →
          </a>
          <hr style="margin:28px 0;border:none;border-top:1px solid #20324a">
          <p style="margin:0;color:#6b7a8d;font-size:12px;text-align:center">
            Breach Radar — Enterprise Security Platform
          </p>
        </div>
      </div>
    `,
    text: `Welcome to Breach Radar, ${name}!\n\nYour account is ready.\n\nLog in here: ${loginUrl}`,
  };
}

// Template 3: Password Reset (already in auth.service.js but reusable here too)
function buildPasswordResetEmail({ email, resetUrl }) {
  return {
    subject: 'Breach Radar — Reset Your Password',
    html: `
      <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
        <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
            <div style="width:36px;height:36px;background:#16e095;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#04120d;font-size:18px">B</div>
            <span style="font-size:20px;font-weight:900;color:#ffffff">Breach Radar</span>
          </div>
          <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">Reset Your Password</h1>
          <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6">
            We received a request to reset the password for your account.
          </p>
          <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px">Account Email</p>
            <strong style="display:block;margin-bottom:16px;color:#ffffff">${email}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px">Link Expires In</p>
            <strong style="display:block;color:#16e095">1 Hour</strong>
          </div>
          <a href="${resetUrl}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:8px;font-size:16px">
            Reset Password →
          </a>
          <p style="margin:24px 0 0;color:#aeb8c7;font-size:13px;line-height:1.6">
            If you did not request this, ignore this email — your password will not change.<br><br>
            If the button does not work:<br>
            <a href="${resetUrl}" style="color:#16e095">${resetUrl}</a>
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #20324a">
          <p style="margin:0;color:#6b7a8d;font-size:12px">This link expires in 1 hour for security reasons.</p>
        </div>
      </div>
    `,
    text: `Reset Your Password\n\nClick to reset: ${resetUrl}\n\nExpires in 1 hour.\n\nIf you did not request this, ignore this email.`,
  };
}

// Template 4: Invoice Email
function buildInvoiceEmail({ invoiceNumber, planName, amount, date, downloadLink }) {
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);

  return {
    subject: `Breach Radar Invoice — ${invoiceNumber}`,
    html: `
      <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
        <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
            <div style="width:36px;height:36px;background:#16e095;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#04120d;font-size:18px">B</div>
            <span style="font-size:20px;font-weight:900;color:#ffffff">Breach Radar</span>
          </div>
          <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">Payment Successful!</h1>
          <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6">Thank you for your payment. Here are your subscription details.</p>
          <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Invoice Number</p>
            <strong style="display:block;margin-bottom:16px;font-size:16px;color:#ffffff">${invoiceNumber}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Plan</p>
            <strong style="display:block;margin-bottom:16px;color:#16e095;font-size:16px">${planName} Plan</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Amount Paid</p>
            <strong style="display:block;margin-bottom:16px;font-size:20px;color:#ffffff">${formattedAmount}</strong>
            <p style="margin:0 0 8px;color:#aeb8c7;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Date</p>
            <strong style="display:block;color:#ffffff">${new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
          </div>
          <a href="${downloadLink}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:8px;font-size:16px">
            Download PDF Invoice →
          </a>
          <hr style="margin:28px 0;border:none;border-top:1px solid #20324a">
          <p style="margin:0;color:#6b7a8d;font-size:12px;text-align:center">
            Thank you for choosing Breach Radar!
          </p>
        </div>
      </div>
    `,
    text: `Payment Successful!\nInvoice: ${invoiceNumber}\nPlan: ${planName}\nAmount: ${formattedAmount}\nDate: ${new Date(date).toLocaleDateString()}\nDownload: ${downloadLink}`,
  };
}

function buildInvitationLink(token) {
  return `${getFrontendInviteBaseUrl()}/${token}`;
}

async function sendInvitationEmail({ to, organizationName, role, token, expiresAt }) {
  const template = buildInvitationEmail({ organizationName, role, token, expiresAt });
  return sendEmail({ to, ...template });
}

async function sendWelcomeEmail({ to, name }) {
  const template = buildWelcomeEmail({ name });
  return sendEmail({ to, ...template });
}

async function sendInvoiceEmail({ to, invoiceNumber, planName, amount, date, downloadLink }) {
  const template = buildInvoiceEmail({ invoiceNumber, planName, amount, date, downloadLink });
  return sendEmail({ to, ...template });
}

async function verifySenderDomainStatus() {
  const apiKey = process.env.RESEND_API_KEY;
  const senderEmail = getSenderEmail();
  const senderDomain = senderEmail.split('@')[1] || '';

  if (!apiKey) {
    return { configured: false, senderEmail, senderDomain, verified: false, reason: 'RESEND_API_KEY missing' };
  }

  if (!senderDomain || senderDomain === 'resend.dev') {
    return {
      configured: true, senderEmail, senderDomain,
      verified: senderDomain === 'resend.dev',
      reason: senderDomain === 'resend.dev' ? 'Using Resend test sender — works for testing.' : 'Sender email is invalid.',
    };
  }

  const response = await fetch(RESEND_DOMAINS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { configured: true, senderEmail, senderDomain, verified: false, reason: payload.message || 'Could not verify domain.', statusCode: response.status };
  }

  const domains = Array.isArray(payload.data) ? payload.data : [];
  const match = domains.find((d) => d.name === senderDomain);

  return {
    configured: true, senderEmail, senderDomain,
    verified: Boolean(match && match.status === 'verified'),
    status: match?.status || 'not_found',
    reason: match ? `Domain status: ${match.status}` : 'Domain not found in Resend verified domains.',
  };
}

module.exports = {
  sendEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
  sendInvoiceEmail,
  buildInvitationEmail,
  buildWelcomeEmail,
  buildPasswordResetEmail,
  buildInvoiceEmail,
  buildInvitationLink,
  getEmailStatus,
  verifySenderDomainStatus,
};
