const Scan = require('../models/Scan');
const Domain = require('../models/Domain');
const Vulnerability = require('../models/Vulnerability');
const { SCAN_STATUS, VULN_STATUS } = require('../constants');
const { assertDomainVerified } = require('./domain.verification.service');
const { runScanners } = require('../scanners');
const {
  countSeverities,
  computeRiskScore,
  computeDomainScore,
  resolveScoreLabel
} = require('../scanners/utils');
const logger = require('../config/logger');

/**
 * Scan lifecycle (maps to existing SCAN_STATUS enum):
 *   pending  -> Queued
 *   running  -> In Progress
 *   completed -> Completed
 *   failed   -> Failed
 */
async function markScanRunning(scan, domain) {
  scan.status = SCAN_STATUS.IN_PROGRESS;
  scan.startedAt = new Date();
  scan.errorDetail = '';
  await scan.save();

  domain.statusDetail = 'Scan in progress...';
  await domain.save();
}

async function persistFindings(scan, findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const finding of findings) {
    const vuln = new Vulnerability({
      workspaceId: scan.workspaceId,
      domainId: scan.domainId,
      scanId: scan._id,
      name: finding.name,
      desc: finding.desc,
      severity: finding.severity,
      status: VULN_STATUS.OPEN,
      tone: finding.tone,
      cwe: finding.cwe,
      path: finding.path,
      impact: finding.impact,
      fix: finding.fix,
      detectedAt: new Date()
    });

    await vuln.save();

    const key = finding.severity.toLowerCase();
    if (counts[key] !== undefined) {
      counts[key] += 1;
    }
  }

  return counts;
}

async function markScanCompleted(scan, domain, findings, scannerMeta) {
  const counts = countSeverities(findings);
  const riskScore = computeRiskScore(counts);
  const domainScore = computeDomainScore(counts);
  const scoreMeta = resolveScoreLabel(domainScore);

  scan.status = SCAN_STATUS.COMPLETED;
  scan.completedAt = new Date();
  scan.vulnerabilitiesCount = counts;
  scan.riskScore = riskScore;
  scan.errorDetail = '';
  await scan.save();

  domain.score = domainScore;
  domain.lastScanAt = new Date();
  domain.status =
    counts.critical > 0 || counts.high > 0 ? 'Needs Attention' : 'Active';
  domain.statusDetail = `Scan completed. ${findings.length} finding(s) from ${scannerMeta.scanners.length} scanner(s).`;
  domain.scoreLabel = scoreMeta.label;
  domain.scoreTone = scoreMeta.tone;
  await domain.save();

  try {
    const alertService = require('./alert.service');
    await alertService.handleScanCompletedAlerts(scan, domain, counts);
  } catch (alertError) {
    logger.warn(`Post-scan alert dispatch failed for scan ${scan._id}: ${alertError.message}`);
  }

  return { counts, riskScore, domainScore };
}

async function markScanFailed(scan, errorMessage) {
  scan.status = SCAN_STATUS.FAILED;
  scan.completedAt = new Date();
  scan.errorDetail = errorMessage;
  await scan.save();

  const domain = await Domain.findById(scan.domainId);
  if (domain) {
    domain.statusDetail = `Scan failed: ${errorMessage}`;
    await domain.save();
  }
}

/**
 * Execute the scan pipeline for a queued job.
 * Called by BullMQ worker or in-process fallback.
 */
async function executeScan(scanId) {
  let scan = null;

  try {
    logger.info(`Starting scan pipeline for Scan ID: ${scanId}`);

    scan = await Scan.findById(scanId);
    if (!scan) {
      logger.error(`Scan record not found: ${scanId}`);
      return { success: false, reason: 'scan_not_found' };
    }

    if (scan.status === SCAN_STATUS.COMPLETED) {
      logger.warn(`Scan ${scanId} already completed — skipping.`);
      return { success: true, skipped: true };
    }

    const domain = await Domain.findById(scan.domainId);
    if (!domain) {
      throw new Error(`Domain record not found: ${scan.domainId}`);
    }

    assertDomainVerified(domain);

    await markScanRunning(scan, domain);

    const scannerMeta = await runScanners(domain.domain, scan.checks);
    const findings = scannerMeta.findings;

    logger.info(
      `Scan ${scanId}: ${scannerMeta.scanners.join(', ')} returned ${findings.length} finding(s)`
    );

    if (findings.length > 0) {
      await persistFindings(scan, findings);
    }

    const summary = await markScanCompleted(scan, domain, findings, scannerMeta);

    logger.info(
      `Scan ${scanId} completed. Findings: ${findings.length}, Risk: ${summary.riskScore}, Domain score: ${summary.domainScore}`
    );

    return {
      success: true,
      scanId,
      findings: findings.length,
      scanners: scannerMeta.scanners,
      summary
    };
  } catch (error) {
    logger.error(`Scan pipeline failed for ${scanId}: ${error.message}`);

    if (scan) {
      await markScanFailed(scan, error.message);
    }

    throw error;
  }
}

module.exports = {
  executeScan,
  markScanRunning,
  markScanCompleted,
  markScanFailed,
  persistFindings
};
