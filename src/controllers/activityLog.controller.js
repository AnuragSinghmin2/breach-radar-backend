const AuditLog = require('../models/AuditLog');

const getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, query = '', type = 'All', status = 'All', startDate, endDate } = req.query;

    const dbQuery = { workspaceId: req.workspaceId };

    if (startDate || endDate) {
      dbQuery.createdAt = {};
      if (startDate) {
        dbQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dbQuery.createdAt.$lte = new Date(endDate);
      }
    }

    if (query) {
      dbQuery.$or = [
        { action: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }

    if (status !== 'All') {
      dbQuery.status = status;
    }

    if (type !== 'All') {
      if (type === 'Scan') {
        dbQuery.action = { $regex: 'Scan', $options: 'i' };
      } else if (type === 'Security') {
        dbQuery.action = { $regex: 'Login|Logout|Password|Security', $options: 'i' };
      } else if (type === 'Vulnerability') {
        dbQuery.action = { $regex: 'Vulnerability', $options: 'i' };
      } else if (type === 'Report') {
        dbQuery.action = { $regex: 'Report', $options: 'i' };
      } else if (type === 'Integration') {
        dbQuery.action = { $regex: 'Integration|Webhook', $options: 'i' };
      } else if (type === 'Team') {
        dbQuery.action = { $regex: 'Team|Invite|Member', $options: 'i' };
      }
    }

    const skipIndex = (parseInt(page) - 1) * parseInt(limit);

    const logs = await AuditLog.find(dbQuery)
      .populate('userId', 'email profile.name')
      .sort({ createdAt: -1 })
      .skip(skipIndex)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(dbQuery);

    const mapped = logs.map(log => ({
      id: log._id,
      type: log.action.split(' ')[0] || 'System',
      title: log.action,
      actor: log.userId ? (log.userId.profile?.name || log.userId.email) : 'System',
      target: log.description,
      time: log.createdAt,
      status: log.status || 'Success',
      ipAddress: log.ipAddress,
      userAgent: log.userAgent
    }));

    res.status(200).json({
      logs: mapped,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    next(error);
  }
};

const exportLogsCsv = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ workspaceId: req.workspaceId })
      .populate('userId', 'email profile.name')
      .sort({ createdAt: -1 });

    let csvContent = 'ID,Action,Description,Actor,IP Address,User Agent,Status,Timestamp\n';
    
    logs.forEach(log => {
      const actor = log.userId ? (log.userId.profile?.name || log.userId.email) : 'System';
      const cleanDesc = (log.description || '').replace(/"/g, '""');
      const cleanAgent = (log.userAgent || '').replace(/"/g, '""');
      csvContent += `"${log._id}","${log.action}","${cleanDesc}","${actor}","${log.ipAddress}","${cleanAgent}","${log.status}","${log.createdAt.toISOString()}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="securescan-activity-log.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLogs,
  exportLogsCsv
};
