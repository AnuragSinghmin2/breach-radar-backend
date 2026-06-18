const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

async function logTeamAudit({ req, userId, action, description, status = 'Success', workspaceId }) {
  try {
    let finalWorkspaceId = workspaceId || req?.workspaceId || null;
    const actorId = userId || req?.user?._id || null;
    
    if (!finalWorkspaceId && actorId) {
      const User = require('../models/User');
      const user = await User.findById(actorId);
      if (user) {
        finalWorkspaceId = user.preferences?.activeWorkspaceId;
      }
    }

    await AuditLog.create({
      workspaceId: finalWorkspaceId,
      userId: actorId,
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
