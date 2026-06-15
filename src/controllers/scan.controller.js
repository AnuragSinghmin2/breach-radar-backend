const scanService = require('../services/scan.service');
const teamService = require('../services/team.service');
const logger = require('../config/logger');

// GET /api/v1/scans
const getScans = async (req, res, next) => {
  try {
    const scans = await scanService.getScanHistory(req.workspaceId, req.query);
    res.status(200).json(scans);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/scans/:id
const getScanById = async (req, res, next) => {
  try {
    const scan = await scanService.getScanById(req.workspaceId, req.params.id);
    res.status(200).json(scan);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/scans/:id/status
const getScanStatus = async (req, res, next) => {
  try {
    const status = await scanService.getScanStatus(req.workspaceId, req.params.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/scans/:id/results
const getScanResults = async (req, res, next) => {
  try {
    const results = await scanService.getScanResults(req.workspaceId, req.params.id);
    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/scans
const startScan = async (req, res, next) => {
  try {
    const { domain, scanType, checks } = req.body;

    const scan = await scanService.startScan({
      workspaceId: req.workspaceId,
      userId: req.user._id,
      domain,
      scanType,
      checks
    });

    logger.info(`Scan started for ${domain} (Type: ${scanType}) by user ${req.user.email}`);
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Scan execution',
      target: domain,
      metadata: { scanId: scan._id, scanType }
    });

    res.status(202).json({
      message: 'Scan successfully queued and started.',
      scan
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/scans/:id/rerun
const rerunScan = async (req, res, next) => {
  try {
    const scan = await scanService.rerunScan({
      workspaceId: req.workspaceId,
      userId: req.user._id,
      scanId: req.params.id
    });

    logger.info(`Scan re-run queued for ${scan.domainId?.domain} by user ${req.user.email}`);
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Scan execution',
      target: scan.domainId?.domain || String(scan._id),
      metadata: { scanId: scan._id, rerun: true }
    });

    res.status(202).json({
      message: 'Scan successfully re-queued.',
      scan
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getScans,
  getScanById,
  getScanStatus,
  getScanResults,
  startScan,
  rerunScan
};
