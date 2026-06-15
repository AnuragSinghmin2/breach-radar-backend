const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

async function logTeamAudit({ req, userId, action, description, status = 'Success' }) {
  try {
    await AuditLog.create({
      userId: userId || req?.user?._id || null,
      action,
      description,
      status,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '',
      userAgent: req?.headers?.['user-agent'] || '',
    });
  } catch (error) {
    logger.error(`Failed to save team audit log: ${error.message}`);
  }
}

module.exports = { logTeamAudit };
