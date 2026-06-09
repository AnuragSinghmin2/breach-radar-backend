const monitoringService = require('../services/monitoring.service');
const alertService = require('../services/alert.service');
const logger = require('../config/logger');

function requireWorkspaceId(req, res) {
  if (!req.workspaceId) {
    res.status(400).json({ message: 'Workspace ID context required' });
    return null;
  }
  return req.workspaceId;
}

const getMonitoring = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const data = await monitoringService.getMonitoringOverview(workspaceId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getAlerts = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const alerts = await alertService.getAlerts(workspaceId, {
      status: req.query.status,
      type: req.query.type,
      limit: req.query.limit
    });

    res.status(200).json({
      alerts: alerts.map((alert) => ({
        id: alert._id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        status: alert.status,
        domain: alert.domainId?.domain || null,
        domainId: alert.domainId?._id || alert.domainId || null,
        metadata: alert.metadata,
        emailSent: alert.emailSent,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.acknowledgedAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

const getSslMonitoring = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const data = await monitoringService.getSslMonitoring(workspaceId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getDomainMonitoring = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const data = await monitoringService.getDomainExpiryMonitoring(workspaceId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const acknowledgeAlert = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const alert = await alertService.acknowledgeAlert(
      workspaceId,
      req.params.id,
      req.user._id
    );

    res.status(200).json({
      message: 'Alert acknowledged',
      alert: {
        id: alert._id,
        status: alert.status,
        acknowledgedAt: alert.acknowledgedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

const testMonitoring = async (req, res, next) => {
  try {
    logger.info('Manual monitoring test started');

    await monitoringService.runFullMonitoringCycle();

    logger.info('Manual monitoring test completed');

    res.status(200).json({
      success: true,
      message: 'Monitoring cycle executed successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMonitoring,
  getAlerts,
  getSslMonitoring,
  getDomainMonitoring,
  acknowledgeAlert,
  testMonitoring
};
