const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');
const Domain = require('../models/Domain');
const Scan = require('../models/Scan');
const Vulnerability = require('../models/Vulnerability');
const Report = require('../models/Report');
const MonitoringEvent = require('../models/MonitoringEvent');
const Alert = require('../models/Alert');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { removeWorkspaceScanJobs } = require('./queue.service');

async function resetWorkspaceData({ workspaceId, userId, userEmail = '', organizationId = null }) {
  if (!workspaceId) {
    const error = new Error('Workspace ID context required.');
    error.statusCode = 400;
    throw error;
  }

  const workspace = await Workspace.findById(workspaceId).select('_id owner');
  if (!workspace) {
    const error = new Error('Workspace not found.');
    error.statusCode = 404;
    throw error;
  }

  if (String(workspace.owner) !== String(userId)) {
    const error = new Error('Only the workspace owner can reset this workspace.');
    error.statusCode = 403;
    throw error;
  }

  const dbSession = await mongoose.startSession();
  let deletedScanIds = [];

  try {
    await dbSession.withTransaction(async () => {
      const scans = await Scan.find({ workspaceId }).select('_id').session(dbSession);
      deletedScanIds = scans.map((scan) => String(scan._id));

      await Vulnerability.deleteMany({ workspaceId }).session(dbSession);
      await Report.deleteMany({ workspaceId }).session(dbSession);
      await Alert.deleteMany({ workspaceId }).session(dbSession);
      await MonitoringEvent.deleteMany({ workspaceId }).session(dbSession);
      await AuditLog.deleteMany({ workspaceId }).session(dbSession);
      await Scan.deleteMany({ workspaceId }).session(dbSession);
      await Domain.deleteMany({ workspaceId }).session(dbSession);

      const notificationQuery = {
        ...(organizationId ? { organizationId } : {}),
        $or: [{ userId }],
      };
      if (userEmail) {
        notificationQuery.$or.push({ email: String(userEmail).toLowerCase() });
      }
      await Notification.deleteMany(notificationQuery).session(dbSession);
    });
  } finally {
    await dbSession.endSession();
  }

  const removedQueuedJobs = await removeWorkspaceScanJobs(deletedScanIds);

  return {
    removedQueuedJobs,
    deletedScanIds: deletedScanIds.length,
  };
}

module.exports = {
  resetWorkspaceData,
};
