const Report = require('../models/Report');
const Scan = require('../models/Scan');
const Domain = require('../models/Domain');
const { REPORT_TEMPLATES, REPORT_STATUS, SCAN_STATUS } = require('../constants');
const teamService = require('../services/team.service');
const logger = require('../config/logger');

function scanTypeToReportType(scanType) {
  if (scanType === 'Quick Scan') return 'quick';
  if (scanType === 'Custom Scan') return 'custom';
  return 'full';
}

function mapScanStatusToReportStatus(status) {
  if (status === SCAN_STATUS.COMPLETED) return REPORT_STATUS.COMPLETED;
  if (status === SCAN_STATUS.FAILED) return REPORT_STATUS.FAILED;
  return REPORT_STATUS.IN_PROGRESS;
}

function formatReportNumber(date) {
  const value = new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${month}${day}`;
}

function formatGeneratedLines(date, fileSize = '-') {
  const value = new Date(date);
  const dateLine = value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const timeLine = value.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `${dateLine}\n${timeLine}\n${fileSize}`;
}

function mapScanToReport(scan) {
  const counts = scan.vulnerabilitiesCount || { critical: 0, high: 0, medium: 0, low: 0 };
  const completed = scan.status === SCAN_STATUS.COMPLETED;
  const generatedAt = scan.completedAt || scan.createdAt;

  return {
    _id: scan._id,
    title:
      scan.scanType === 'Quick Scan'
        ? 'Quick Scan Report'
        : scan.scanType === 'Custom Scan'
          ? 'Custom Scan Report'
          : 'Security Scan Report',
    id: `#RPT-${new Date(scan.createdAt).getFullYear()}-${formatReportNumber(scan.createdAt)}-${scan._id.toString().slice(-6).toUpperCase()}`,
    domain: scan.domainId?.domain || '',
    scanType: scan.scanType,
    status: mapScanStatusToReportStatus(scan.status),
    vulns: completed
      ? [counts.critical, counts.high, counts.medium, counts.low]
      : null,
    score: completed ? scan.domainId?.score ?? scan.riskScore ?? null : null,
    generated: formatGeneratedLines(generatedAt, completed ? '2.4 MB' : '-'),
    type: scanTypeToReportType(scan.scanType),
    owner: 'Security Team',
    scanId: scan._id,
    generatedAt
  };
}

function mapReportDocument(report) {
  const scan = report.scanId;
  const counts = scan?.vulnerabilitiesCount || { critical: 0, high: 0, medium: 0, low: 0 };
  const completed = report.status === REPORT_STATUS.COMPLETED;

  return {
    _id: report._id,
    title: report.title,
    id: report.reportNumber,
    domain: report.domainId?.domain || '',
    scanType: scan?.scanType || 'Full Scan',
    status: report.status,
    vulns: completed ? [counts.critical, counts.high, counts.medium, counts.low] : null,
    score: completed ? report.domainId?.score ?? scan?.riskScore ?? null : null,
    generated: formatGeneratedLines(report.generatedAt, report.fileSize || '-'),
    type: scan ? scanTypeToReportType(scan.scanType) : 'full',
    owner: report.owner || 'Security Team',
    scanId: report.scanId?._id || report.scanId,
    generatedAt: report.generatedAt
  };
}

// GET /api/v1/reports
const getReports = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID context required' });
    }

    const savedReports = await Report.find({ workspaceId })
      .populate('domainId', 'domain score')
      .populate('scanId')
      .sort({ generatedAt: -1 });

    if (savedReports.length > 0) {
      return res.status(200).json({
        reports: savedReports.map(mapReportDocument)
      });
    }

    const scans = await Scan.find({ workspaceId })
      .populate('domainId', 'domain score')
      .sort({ createdAt: -1 });

    res.status(200).json({
      reports: scans.map(mapScanToReport)
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/reports
const generateReport = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    const { domain, scanType, template, owner, sections, scanId } = req.body;

    if (!domain) {
      return res.status(400).json({ message: 'Domain is required.' });
    }

    const domainObj = await Domain.findOne({
      workspaceId,
      domain: domain.trim().toLowerCase()
    });

    if (!domainObj) {
      return res.status(404).json({ message: `Domain "${domain}" is not registered in this workspace.` });
    }

    let scan = null;

    if (scanId) {
      scan = await Scan.findOne({ _id: scanId, workspaceId }).populate('domainId', 'domain score');
    } else {
      const scanQuery = { workspaceId, domainId: domainObj._id };
      if (scanType) scanQuery.scanType = scanType;
      scan = await Scan.findOne(scanQuery)
        .populate('domainId', 'domain score')
        .sort({ createdAt: -1 });
    }

    if (!scan) {
      return res.status(404).json({ message: 'No scan found for this domain. Run a scan first.' });
    }

    const reportNumber = `#RPT-${new Date().getFullYear()}-${formatReportNumber(new Date())}-${String(Date.now()).slice(-6)}`;
    const selectedTemplate = Object.values(REPORT_TEMPLATES).includes(template)
      ? template
      : REPORT_TEMPLATES.EXECUTIVE;

    const report = new Report({
      workspaceId,
      domainId: domainObj._id,
      scanId: scan._id,
      title: `${selectedTemplate} Security Report`,
      reportNumber,
      template: selectedTemplate,
      status:
        scan.status === SCAN_STATUS.COMPLETED
          ? REPORT_STATUS.COMPLETED
          : REPORT_STATUS.IN_PROGRESS,
      owner: owner || 'Security Team',
      sections: Array.isArray(sections) ? sections : [],
      fileSize: scan.status === SCAN_STATUS.COMPLETED ? `${(1.4 + (sections?.length || 0) * 0.18).toFixed(1)} MB` : '-',
      generatedAt: new Date()
    });

    await report.save();
    await report.populate([
      { path: 'domainId', select: 'domain score' },
      { path: 'scanId' }
    ]);

    logger.info(`Report generated: ${reportNumber} for ${domainObj.domain}`);
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Report download',
      target: domainObj.domain,
      metadata: { reportId: report._id, generated: true }
    });

    res.status(201).json({
      message: 'Report generated successfully.',
      report: mapReportDocument(report)
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/reports/:id
const getReportFile = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;

    const report = await Report.findOne({ _id: id, workspaceId })
      .populate('domainId', 'domain score')
      .populate('scanId');

    if (report) {
      await teamService.recordWorkspaceActivity({
        userId: req.user._id,
        action: 'Report download',
        target: report.domainId?.domain || String(report._id),
        metadata: { reportId: report._id }
      });
      return res.status(200).json(mapReportDocument(report));
    }

    const scan = await Scan.findOne({ _id: id, workspaceId }).populate('domainId', 'domain score');
    if (!scan) {
      return res.status(404).json({ message: 'Report not found or unauthorized.' });
    }
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Report download',
      target: scan.domainId?.domain || String(scan._id),
      metadata: { scanId: scan._id }
    });

    res.status(200).json(mapScanToReport(scan));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReports,
  generateReport,
  getReportFile
};
