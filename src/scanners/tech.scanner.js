const https = require('https');
const http = require('http');
const { createFinding, createResult, withTimeout } = require('./utils');
const { SEVERITY_LEVELS } = require('../constants');

const SCANNER_NAME = 'tech';
const TIMEOUT_MS = 10000;

const TECH_SIGNATURES = [
  { header: 'server', pattern: /nginx/i, name: 'Nginx', risk: SEVERITY_LEVELS.LOW },
  { header: 'server', pattern: /apache/i, name: 'Apache', risk: SEVERITY_LEVELS.LOW },
  { header: 'server', pattern: /cloudflare/i, name: 'Cloudflare', risk: SEVERITY_LEVELS.LOW },
  { header: 'x-powered-by', pattern: /express/i, name: 'Express.js', risk: SEVERITY_LEVELS.MEDIUM },
  { header: 'x-powered-by', pattern: /php\//i, name: 'PHP', risk: SEVERITY_LEVELS.MEDIUM },
  { header: 'x-aspnet-version', pattern: /./, name: 'ASP.NET', risk: SEVERITY_LEVELS.MEDIUM },
  { header: 'x-generator', pattern: /wordpress/i, name: 'WordPress', risk: SEVERITY_LEVELS.MEDIUM }
];

function fetchResponse(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const request = client.get(
      url,
      { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'SecureScan/1.0' } },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => {
          chunks.push(chunk);
          if (chunks.reduce((sum, item) => sum + item.length, 0) > 50000) {
            request.destroy();
          }
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8').slice(0, 50000),
            finalUrl: urlString
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Technology fingerprint request timed out'));
    });

    request.on('error', reject);
  });
}

function detectFromHeaders(headers) {
  const detected = [];
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );

  TECH_SIGNATURES.forEach((signature) => {
    const value = normalized[signature.header];
    if (value && signature.pattern.test(value)) {
      detected.push({
        name: signature.name,
        source: signature.header,
        value,
        risk: signature.risk
      });
    }
  });

  return detected;
}

function detectFromBody(body) {
  const detected = [];

  if (/wp-content|wordpress/i.test(body)) {
    detected.push({ name: 'WordPress', source: 'body', value: 'wp-content', risk: SEVERITY_LEVELS.MEDIUM });
  }
  if (/react|__NEXT_DATA__/i.test(body)) {
    detected.push({ name: 'React', source: 'body', value: 'react markers', risk: SEVERITY_LEVELS.LOW });
  }
  if (/django/i.test(body)) {
    detected.push({ name: 'Django', source: 'body', value: 'django markers', risk: SEVERITY_LEVELS.LOW });
  }

  return detected;
}

async function scanTech(domain) {
  const findings = [];
  const metadata = { domain, technologies: [] };

  let response = null;

  for (const target of [`https://${domain}`, `http://${domain}`]) {
    try {
      response = await withTimeout(fetchResponse(target), TIMEOUT_MS, 'Technology scan');
      break;
    } catch {
      // Try fallback protocol
    }
  }

  if (!response) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'Technology Fingerprint Failed',
        desc: 'Could not retrieve a response for technology detection.',
        severity: SEVERITY_LEVELS.MEDIUM,
        cwe: 'CWE-200',
        path: `https://${domain}`,
        impact: 'Technology exposure cannot be assessed.',
        fix: 'Ensure the application responds to HTTP or HTTPS requests.'
      })
    );

    return createResult(SCANNER_NAME, findings, metadata, false);
  }

  const detected = [
    ...detectFromHeaders(response.headers),
    ...detectFromBody(response.body)
  ];

  const unique = [];
  const seen = new Set();

  detected.forEach((item) => {
    const key = `${item.name}:${item.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  });

  metadata.technologies = unique;

  if (unique.length === 0) {
    return createResult(SCANNER_NAME, findings, metadata, true);
  }

  unique.forEach((tech) => {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: `Exposed Technology: ${tech.name}`,
        desc: `Detected via ${tech.source}: ${tech.value}`,
        severity: tech.risk,
        cwe: 'CWE-200',
        path: response.finalUrl,
        impact: 'Public technology signals help attackers tailor exploits.',
        fix: 'Minimize technology disclosure headers and keep components patched.'
      })
    );
  });

  const highRiskStack = unique.filter((tech) => tech.risk === SEVERITY_LEVELS.MEDIUM);
  if (highRiskStack.length >= 2) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'Multiple Stack Components Exposed',
        desc: 'Several backend technologies are publicly identifiable.',
        severity: SEVERITY_LEVELS.MEDIUM,
        cwe: 'CWE-200',
        path: response.finalUrl,
        impact: 'Broader attack surface for targeted vulnerability research.',
        fix: 'Harden and patch all exposed stack components and remove version banners.'
      })
    );
  }

  return createResult(SCANNER_NAME, findings, metadata, true);
}

module.exports = {
  scanTech
};
