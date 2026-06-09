const whoiser = require('whoiser');
const logger = require('../config/logger');
const { EXPIRY_THRESHOLDS, SEVERITY_LEVELS } = require('../constants');
const { daysUntil, resolveExpirySeverity, resolveExpiryTier } = require('./ssl.service');

const WHOIS_TIMEOUT_MS = 15000;

const EXPIRY_FIELD_PATTERNS = [
  'expiry date',
  'registry expiry date',
  'registrar registration expiration date',
  'expiration date',
  'paid-till',
  'renewal date'
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('WHOIS lookup timed out')), ms);
    })
  ]);
}

function flattenWhoisEntries(data) {
  const entries = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    entries.push(node);
    Object.values(node).forEach(walk);
  }

  walk(data);
  return entries;
}

function parseWhoisDate(value) {
  if (!value) return null;

  const raw = Array.isArray(value) ? value[0] : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractRegistrar(data) {
  const entries = flattenWhoisEntries(data);

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    for (const [key, value] of Object.entries(entry)) {
      const normalized = key.toLowerCase();
      if (normalized.includes('registrar') && !normalized.includes('expiration')) {
        return Array.isArray(value) ? value[0] : String(value);
      }
    }
  }

  return '';
}

function extractExpiryDate(data) {
  const entries = flattenWhoisEntries(data);

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    for (const [key, value] of Object.entries(entry)) {
      const normalized = key.toLowerCase();
      if (EXPIRY_FIELD_PATTERNS.some((pattern) => normalized.includes(pattern))) {
        const parsed = parseWhoisDate(value);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

async function fetchDomainExpiryInfo(domain) {
  try {
    const whoisData = await withTimeout(whoiser(domain, { follow: 2, timeout: WHOIS_TIMEOUT_MS }), WHOIS_TIMEOUT_MS);
    const expiryDate = extractExpiryDate(whoisData);
    const registrar = extractRegistrar(whoisData);
    const daysRemaining = expiryDate ? daysUntil(expiryDate) : null;

    return {
      success: Boolean(expiryDate),
      domain,
      expiryDate,
      registrar,
      daysRemaining,
      severity: expiryDate ? resolveExpirySeverity(daysRemaining) : SEVERITY_LEVELS.MEDIUM,
      tier: expiryDate ? resolveExpiryTier(daysRemaining) : 'unknown',
      error: expiryDate ? null : 'Domain expiry date not found in WHOIS response'
    };
  } catch (error) {
    logger.warn(`WHOIS lookup failed for ${domain}: ${error.message}`);
    return {
      success: false,
      domain,
      expiryDate: null,
      registrar: '',
      daysRemaining: null,
      severity: SEVERITY_LEVELS.MEDIUM,
      tier: 'error',
      error: error.message
    };
  }
}

module.exports = {
  fetchDomainExpiryInfo
};
