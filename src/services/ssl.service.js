const tls = require('tls');
const logger = require('../config/logger');
const { EXPIRY_THRESHOLDS, SEVERITY_LEVELS } = require('../constants');

const TIMEOUT_MS = 10000;

function inspectCertificate(domain) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      443,
      domain,
      { servername: domain, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert);
      }
    );

    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error('TLS handshake timed out'));
    });

    socket.on('error', reject);
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    })
  ]);
}

function daysUntil(date) {
  return Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function resolveExpirySeverity(daysRemaining) {
  if (daysRemaining < 0) {
    return SEVERITY_LEVELS.CRITICAL;
  }
  if (daysRemaining <= EXPIRY_THRESHOLDS.HIGH_DAYS) {
    return SEVERITY_LEVELS.HIGH;
  }
  if (daysRemaining <= EXPIRY_THRESHOLDS.WARNING_DAYS) {
    return SEVERITY_LEVELS.MEDIUM;
  }
  return null;
}

function resolveExpiryTier(daysRemaining) {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= EXPIRY_THRESHOLDS.HIGH_DAYS) return '7d';
  if (daysRemaining <= EXPIRY_THRESHOLDS.WARNING_DAYS) return '30d';
  return 'ok';
}

async function fetchSslCertificateInfo(domain) {
  try {
    const cert = await withTimeout(inspectCertificate(domain), TIMEOUT_MS, 'SSL check');

    if (!cert || Object.keys(cert).length === 0) {
      return {
        success: false,
        domain,
        error: 'No TLS certificate presented on port 443',
        expiryDate: null,
        issuer: '',
        daysRemaining: null,
        severity: SEVERITY_LEVELS.HIGH
      };
    }

    const expiryDate = new Date(cert.valid_to);
    const daysRemaining = Number.isNaN(expiryDate.getTime()) ? null : daysUntil(expiryDate);

    return {
      success: true,
      domain,
      expiryDate: Number.isNaN(expiryDate.getTime()) ? null : expiryDate,
      issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
      subject: cert.subject?.CN || domain,
      daysRemaining,
      severity: daysRemaining === null ? SEVERITY_LEVELS.MEDIUM : resolveExpirySeverity(daysRemaining),
      tier: daysRemaining === null ? 'unknown' : resolveExpiryTier(daysRemaining)
    };
  } catch (error) {
    logger.warn(`SSL check failed for ${domain}: ${error.message}`);
    return {
      success: false,
      domain,
      error: error.message,
      expiryDate: null,
      issuer: '',
      daysRemaining: null,
      severity: SEVERITY_LEVELS.HIGH,
      tier: 'error'
    };
  }
}

module.exports = {
  fetchSslCertificateInfo,
  resolveExpirySeverity,
  resolveExpiryTier,
  daysUntil
};
