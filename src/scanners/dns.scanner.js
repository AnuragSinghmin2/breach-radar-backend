const dns = require('dns').promises;
const { createFinding, createResult, withTimeout } = require('./utils');
const { SEVERITY_LEVELS } = require('../constants');

const SCANNER_NAME = 'dns';
const TIMEOUT_MS = 8000;

async function safeResolve(method, hostname) {
  try {
    return await withTimeout(method(hostname), TIMEOUT_MS, `DNS ${method.name}`);
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(error.code)) {
      return null;
    }
    throw error;
  }
}

async function scanDns(domain) {
  const findings = [];
  const metadata = { domain, records: {} };

  try {
    const [aRecords, aaaaRecords, mxRecords, txtRecords, nsRecords] = await Promise.all([
      safeResolve(dns.resolve4, domain),
      safeResolve(dns.resolve6, domain),
      safeResolve(dns.resolveMx, domain),
      safeResolve(dns.resolveTxt, domain),
      safeResolve(dns.resolveNs, domain)
    ]);

    metadata.records = {
      A: aRecords || [],
      AAAA: aaaaRecords || [],
      MX: mxRecords || [],
      TXT: txtRecords || [],
      NS: nsRecords || []
    };

    if (!aRecords?.length && !aaaaRecords?.length) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'No Address Records',
          desc: 'No A or AAAA DNS records were found for the domain.',
          severity: SEVERITY_LEVELS.HIGH,
          cwe: 'CWE-200',
          path: domain,
          impact: 'The domain may be unreachable or misconfigured.',
          fix: 'Publish valid A or AAAA records for the domain.'
        })
      );
    }

    if (!mxRecords?.length) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Missing MX Records',
          desc: 'No mail exchange records were discovered.',
          severity: SEVERITY_LEVELS.LOW,
          cwe: 'CWE-200',
          path: domain,
          impact: 'Email delivery may fail for this domain.',
          fix: 'Add MX records if the domain is intended to receive email.'
        })
      );
    }

    const flattenedTxt = (txtRecords || []).flat().join(' ').toLowerCase();
    const hasSpf = flattenedTxt.includes('v=spf1');
    const hasDmarc = flattenedTxt.includes('v=dmarc1');

    if (mxRecords?.length && !hasSpf) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Missing SPF Record',
          desc: 'Domain accepts mail but no SPF TXT record was found.',
          severity: SEVERITY_LEVELS.MEDIUM,
          cwe: 'CWE-200',
          path: domain,
          impact: 'Attackers can spoof email appearing to originate from this domain.',
          fix: 'Publish an SPF TXT record defining authorized mail senders.'
        })
      );
    }

    if (!hasDmarc) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Missing DMARC Record',
          desc: 'No DMARC policy TXT record was found.',
          severity: SEVERITY_LEVELS.LOW,
          cwe: 'CWE-200',
          path: domain,
          impact: 'Reduced visibility and policy enforcement for email spoofing.',
          fix: 'Publish a DMARC TXT record at _dmarc.<domain>.'
        })
      );
    }

    if (nsRecords?.length === 1) {
      findings.push(
        createFinding({
          scanner: SCANNER_NAME,
          name: 'Single Nameserver',
          desc: 'Only one nameserver is configured for the domain.',
          severity: SEVERITY_LEVELS.LOW,
          cwe: 'CWE-200',
          path: domain,
          impact: 'DNS availability depends on a single nameserver.',
          fix: 'Configure multiple authoritative nameservers for redundancy.'
        })
      );
    }
  } catch (error) {
    findings.push(
      createFinding({
        scanner: SCANNER_NAME,
        name: 'DNS Resolution Failed',
        desc: error.message,
        severity: SEVERITY_LEVELS.HIGH,
        cwe: 'CWE-200',
        path: domain,
        impact: 'DNS posture could not be evaluated.',
        fix: 'Verify DNS hosting and nameserver configuration.'
      })
    );

    return createResult(SCANNER_NAME, findings, { ...metadata, error: error.message }, false);
  }

  return createResult(SCANNER_NAME, findings, metadata, true);
}

module.exports = {
  scanDns
};
