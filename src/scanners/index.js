const { scanSsl } = require('./ssl.scanner');
const { scanHeaders } = require('./headers.scanner');
const { scanDns } = require('./dns.scanner');
const { scanTech } = require('./tech.scanner');

const ADAPTERS = {
  ssl: scanSsl,
  headers: scanHeaders,
  dns: scanDns,
  tech: scanTech
};

function resolveEnabledScanners(checks = {}) {
  const enabled = [];

  if (checks.ssl) enabled.push('ssl');
  if (checks.headers) enabled.push('headers');
  if (checks.ports || checks.compliance) enabled.push('dns');
  if (checks.malware || checks.owasp) enabled.push('tech');

  if (enabled.length === 0) {
    enabled.push('ssl', 'headers');
  }

  return [...new Set(enabled)];
}

async function runScanners(domain, checks = {}) {
  const enabled = resolveEnabledScanners(checks);
  const results = [];

  for (const scannerName of enabled) {
    const adapter = ADAPTERS[scannerName];
    if (!adapter) continue;

    try {
      const result = await adapter(domain);
      results.push(result);
    } catch (error) {
      results.push({
        scanner: scannerName,
        success: false,
        findings: [],
        metadata: { error: error.message }
      });
    }
  }

  const findings = results.flatMap((result) => result.findings || []);

  return {
    scanners: enabled,
    results,
    findings
  };
}

module.exports = {
  ADAPTERS,
  resolveEnabledScanners,
  runScanners
};
