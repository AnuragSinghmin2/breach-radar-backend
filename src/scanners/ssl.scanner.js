const tls = require('tls');
const { createFinding, createResult, withTimeout } = require('./utils');
const { SEVERITY_LEVELS } = require('../constants');

const SCANNER_NAME = 'ssl';
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

async function scanSsl(domain) {
  const findings = [];
  const metadata = { domain, port: 443 };

  try {
    const cert = await withTimeout(inspectCertificate(domain), TIMEOUT_MS, 'SSL scan');

    if (!cert || Object.keys(cert).length === 0) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'No TLS Certificate',
          desc: 'The host did not present a valid TLS certificate on port 443.',
          severity: SEVERITY_LEVELS.HIGH,
          cwe: 'CWE-295',
          path: `https://${domain}`,
          impact: 'Clients cannot establish trusted encrypted connections.',
          fix: 'Install a valid TLS certificate and enable HTTPS on port 443.'
        })
      );

      return createResult(SCANNER_NAME, findings, metadata, false);
    }

    metadata.subject = cert.subject?.CN || domain;
    metadata.issuer = cert.issuer?.O || 'Unknown';
    metadata.validTo = cert.valid_to;

    const expiresAt = new Date(cert.valid_to);
    const daysUntilExpiry = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

    if (Number.isNaN(expiresAt.getTime())) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Invalid Certificate Expiry',
          desc: 'Certificate expiry date could not be parsed.',
          severity: SEVERITY_LEVELS.MEDIUM,
          cwe: 'CWE-298',
          path: `https://${domain}`,
          impact: 'Certificate lifecycle cannot be verified automatically.',
          fix: 'Renew the certificate and ensure valid notAfter metadata is served.'
        })
      );
    } else if (daysUntilExpiry < 0) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Expired TLS Certificate',
          desc: `Certificate expired on ${cert.valid_to}.`,
          severity: SEVERITY_LEVELS.CRITICAL,
          cwe: 'CWE-298',
          path: `https://${domain}`,
          impact: 'Browsers and API clients will reject HTTPS connections.',
          fix: 'Renew and redeploy the TLS certificate immediately.'
        })
      );
    } else if (daysUntilExpiry <= 30) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'TLS Certificate Expiring Soon',
          desc: `Certificate expires in ${daysUntilExpiry} day(s).`,
          severity: SEVERITY_LEVELS.MEDIUM,
          cwe: 'CWE-298',
          path: `https://${domain}`,
          impact: 'Service disruption if renewal is missed.',
          fix: 'Schedule certificate renewal before expiry.'
        })
      );
    }

    if (cert.issuer && cert.subject && cert.issuer.CN === cert.subject.CN) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Self-Signed Certificate',
          desc: 'The presented certificate appears to be self-signed.',
          severity: SEVERITY_LEVELS.HIGH,
          cwe: 'CWE-295',
          path: `https://${domain}`,
          impact: 'Clients cannot validate trust chain without manual exceptions.',
          fix: 'Use a certificate issued by a trusted certificate authority.'
        })
      );
    }
  } catch (error) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'TLS Connection Failed',
        desc: error.message,
        severity: SEVERITY_LEVELS.HIGH,
        cwe: 'CWE-319',
        path: `https://${domain}`,
        impact: 'HTTPS may be unavailable or misconfigured.',
        fix: 'Verify TLS termination, firewall rules, and certificate installation.'
      })
    );

    return createResult(SCANNER_NAME, findings, { ...metadata, error: error.message }, false);
  }

  return createResult(SCANNER_NAME, findings, metadata, true);
}

module.exports = {
  scanSsl
};
