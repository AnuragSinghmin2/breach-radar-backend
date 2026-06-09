require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Domain = require('../src/models/Domain');
const Scan = require('../src/models/Scan');
const Vulnerability = require('../src/models/Vulnerability');
const { SCAN_STATUS, SCAN_TYPES, DOMAIN_VERIFICATION_STATUS } = require('../src/constants');
const { executeScan } = require('../src/services/scanner.service');
const { getDashboardStats } = require('../src/services/dashboard.service');

function parseDomainArg() {
  const arg = process.argv.find((item) => item.startsWith('--domain='));
  return (process.env.SCAN_TEST_DOMAIN || arg?.split('=')[1] || '').trim().toLowerCase();
}

async function findVerifiedDomain(domainName) {
  const query = {
    verificationStatus: DOMAIN_VERIFICATION_STATUS.VERIFIED
  };

  if (domainName) {
    query.domain = domainName;
  }

  return Domain.findOne(query).sort({ updatedAt: -1 });
}

async function main() {
  await connectDB();

  const requestedDomain = parseDomainArg();
  const domain = await findVerifiedDomain(requestedDomain);

  if (!domain) {
    const target = requestedDomain ? `"${requestedDomain}"` : 'any domain';
    throw new Error(`No verified domain found for ${target}. Verify a domain before running this test.`);
  }

  const scan = await Scan.create({
    workspaceId: domain.workspaceId,
    domainId: domain._id,
    scanType: SCAN_TYPES.QUICK,
    status: SCAN_STATUS.QUEUED,
    triggeredBy: 'system-test',
    checks: {
      ssl: true,
      headers: true,
      owasp: false,
      malware: false,
      ports: false,
      compliance: false
    }
  });

  console.log(`Created test scan ${scan._id} for ${domain.domain}`);

  const result = await executeScan(scan._id);
  const savedScan = await Scan.findById(scan._id);
  const savedFindings = await Vulnerability.countDocuments({ scanId: scan._id });
  const dashboard = await getDashboardStats(domain.workspaceId);

  console.log('Scan execution result:');
  console.log({
    success: result.success,
    scanId: String(scan._id),
    domain: domain.domain,
    status: savedScan.status,
    findingsReported: result.findings,
    findingsStored: savedFindings,
    riskScore: savedScan.riskScore,
    vulnerabilitiesCount: savedScan.vulnerabilitiesCount,
    dashboard
  });
}

main()
  .catch((error) => {
    console.error(`Scan pipeline test failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
