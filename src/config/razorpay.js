const Razorpay = require('razorpay');
const logger = require('./logger');

let razorpayClient = null;
let razorpayClientKeyId = null;

function mask(value) {
  if (!value) return 'missing';
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function getRazorpayModeFromKey(keyId) {
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return 'unknown';
}

function getRazorpayCredentials() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  const missing = [];

  if (!keyId) missing.push('RAZORPAY_KEY_ID');
  if (!keySecret) missing.push('RAZORPAY_KEY_SECRET');

  if (missing.length > 0) {
    const error = new Error(`Missing Razorpay environment variables: ${missing.join(', ')}`);
    error.statusCode = 500;
    error.code = 'RAZORPAY_KEYS_MISSING';
    throw error;
  }

  if (keyId.includes('placeholder') || keySecret.includes('placeholder')) {
    const error = new Error('Razorpay environment variables still contain placeholder values.');
    error.statusCode = 500;
    error.code = 'RAZORPAY_KEYS_PLACEHOLDER';
    throw error;
  }

  if (!/^rzp_(test|live)_/.test(keyId)) {
    const error = new Error('RAZORPAY_KEY_ID has an invalid format.');
    error.statusCode = 500;
    error.code = 'RAZORPAY_KEY_ID_INVALID';
    throw error;
  }

  return { keyId, keySecret };
}

function getRazorpayKeyInfo() {
  const { keyId } = getRazorpayCredentials();
  const mode = getRazorpayModeFromKey(keyId);

  return {
    keyId,
    maskedKeyId: mask(keyId),
    keyPrefix: keyId.slice(0, 8),
    mode,
    isTestMode: mode === 'test',
    isLiveMode: mode === 'live'
  };
}

function validateRazorpayEnv() {
  try {
    const keyInfo = getRazorpayKeyInfo();
    const expectedMode = String(process.env.RAZORPAY_EXPECTED_MODE || '').trim().toLowerCase();
    logger.info(`[razorpay] Startup validation passed. keyPrefix=${keyInfo.keyPrefix} keyId=${keyInfo.maskedKeyId} mode=${keyInfo.mode}`);

    if (keyInfo.isLiveMode) {
      logger.error('[razorpay] LIVE MODE key is active. Test payments require an rzp_test_ key.');
    }

    if (expectedMode && expectedMode !== keyInfo.mode) {
      logger.error(`[razorpay] Expected ${expectedMode} mode but active key is ${keyInfo.mode}. Check deployment environment variables.`);
    }

    return true;
  } catch (error) {
    logger.error(`[razorpay] Startup validation failed: ${error.message}`);
    return false;
  }
}

function getRazorpayClient() {
  const { keyId, keySecret } = getRazorpayCredentials();

  if (!razorpayClient || razorpayClientKeyId !== keyId) {
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
    razorpayClientKeyId = keyId;
  }

  return razorpayClient;
}

function logRazorpayError(prefix, error) {
  const details = {
    message: error.message,
    statusCode: error.statusCode,
    code: error.code || error.error?.code,
    description: error.error?.description,
    field: error.error?.field,
    reason: error.error?.reason,
    step: error.error?.step,
    source: error.error?.source
  };

  logger.error(`${prefix}: ${JSON.stringify(details)}`);
}

module.exports = {
  getRazorpayCredentials,
  getRazorpayKeyInfo,
  getRazorpayClient,
  logRazorpayError,
  validateRazorpayEnv
};
