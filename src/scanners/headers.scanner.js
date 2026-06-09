const https = require('https');
const http = require('http');
const { createFinding, createResult, withTimeout } = require('./utils');
const { SEVERITY_LEVELS } = require('../constants');

const SCANNER_NAME = 'headers';
const TIMEOUT_MS = 10000;

const REQUIRED_HEADERS = [
  {
    key: 'strict-transport-security',
    name: 'Missing HSTS Header',
    severity: SEVERITY_LEVELS.MEDIUM,
    cwe: 'CWE-319',
    impact: 'Browsers may not enforce HTTPS-only connections.',
    fix: 'Set Strict-Transport-Security with an appropriate max-age.'
  },
  {
    key: 'x-frame-options',
    name: 'Missing X-Frame-Options',
    severity: SEVERITY_LEVELS.MEDIUM,
    cwe: 'CWE-1021',
    impact: 'The site may be embedded in clickjacking attacks.',
    fix: 'Set X-Frame-Options to DENY or SAMEORIGIN.'
  },
  {
    key: 'x-content-type-options',
    name: 'Missing X-Content-Type-Options',
    severity: SEVERITY_LEVELS.LOW,
    cwe: 'CWE-693',
    impact: 'Browsers may MIME-sniff responses unexpectedly.',
    fix: 'Set X-Content-Type-Options to nosniff.'
  },
  {
    key: 'content-security-policy',
    name: 'Missing Content-Security-Policy',
    severity: SEVERITY_LEVELS.MEDIUM,
    cwe: 'CWE-79',
    impact: 'Reduced protection against XSS and content injection.',
    fix: 'Define a restrictive Content-Security-Policy.'
  }
];

function fetchHeaders(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const request = client.get(
      url,
      { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'SecureScan/1.0' } },
      (response) => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          finalUrl: urlString
        });
        response.resume();
      }
    );

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('HTTP request timed out'));
    });

    request.on('error', reject);
  });
}

async function scanHeaders(domain) {
  const findings = [];
  const metadata = { domain };

  const targets = [`https://${domain}`, `http://${domain}`];
  let response = null;

  for (const target of targets) {
    try {
      response = await withTimeout(fetchHeaders(target), TIMEOUT_MS, 'Headers scan');
      metadata.finalUrl = response.finalUrl;
      metadata.statusCode = response.statusCode;
      break;
    } catch {
      // Try next protocol
    }
  }

  if (!response) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'HTTP Response Unavailable',
        desc: 'Could not retrieve HTTP response headers from the domain.',
        severity: SEVERITY_LEVELS.HIGH,
        cwe: 'CWE-200',
        path: `https://${domain}`,
        impact: 'Security header posture cannot be evaluated.',
        fix: 'Ensure the web service is reachable over HTTP or HTTPS.'
      })
    );

    return createResult(SCANNER_NAME, findings, metadata, false);
  }

  const normalized = Object.fromEntries(
    Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  metadata.headerCount = Object.keys(normalized).length;

  REQUIRED_HEADERS.forEach((rule) => {
    if (!normalized[rule.key]) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: rule.name,
          desc: `Response did not include the ${rule.key} header.`,
          severity: rule.severity,
          cwe: rule.cwe,
          path: response.finalUrl,
          impact: rule.impact,
          fix: rule.fix
        })
      );
    }
  });

  if (normalized['x-powered-by']) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'Technology Disclosure Header',
        desc: `X-Powered-By exposes "${normalized['x-powered-by']}".`,
        severity: SEVERITY_LEVELS.LOW,
        cwe: 'CWE-200',
        path: response.finalUrl,
        impact: 'Attackers gain hints about backend stack and version.',
        fix: 'Remove X-Powered-By from production responses.'
      })
    );
  }

  if (!response.finalUrl.startsWith('https://') && normalized['strict-transport-security']) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'HSTS Served Over HTTP',
        desc: 'HSTS header was observed on a non-HTTPS response.',
        severity: SEVERITY_LEVELS.LOW,
        cwe: 'CWE-319',
        path: response.finalUrl,
        impact: 'HSTS policy may not be applied consistently.',
        fix: 'Serve HSTS only on HTTPS responses and redirect HTTP to HTTPS.'
      })
    );
  }

  return createResult(SCANNER_NAME, findings, metadata, true);
}

module.exports = {
  scanHeaders
};
