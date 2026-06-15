const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

const logAuditEvent = async ({ req, userId, workspaceId, action, description, status = 'Success' }) => {
  try {
    const logData = {
      action,
      description,
      status
    };

    if (req) {
      logData.userId = userId || req.user?._id;
      logData.workspaceId = workspaceId || req.workspaceId || req.user?.preferences?.activeWorkspaceId;
      logData.ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      logData.userAgent = req.headers['user-agent'] || '';
    } else {
      if (userId) logData.userId = userId;
      if (workspaceId) logData.workspaceId = workspaceId;
    }

    const audit = new AuditLog(logData);
    await audit.save();
  } catch (error) {
    logger.error(`Failed to save audit log: ${error.message}`);
  }
};

module.exports = { logAuditEvent };
