const AuditLog = require('../models/AuditLog');

const logAudit = async ({ workspaceId = null, userId = null, action, description = '', ipAddress = '', userAgent = '', status = 'Success' }) => {
  try {
    return await AuditLog.create({
      workspaceId,
      userId,
      action,
      description,
      ipAddress,
      userAgent,
      status
    });
  } catch (error) {
    console.error('Audit logging failed:', error.message);
  }
};

const logRequestAudit = async (req, action, description = '', status = 'Success') => {
  const workspaceId = req.workspaceId || null;
  const userId = req.user ? req.user._id : null;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  return logAudit({
    workspaceId,
    userId,
    action,
    description,
    ipAddress,
    userAgent,
    status
  });
};

module.exports = {
  logAudit,
  logRequestAudit
};
