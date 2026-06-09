const { getDashboardStats } = require('../services/dashboard.service');

// GET /api/v1/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID context required' });
    }

    const stats = await getDashboardStats(workspaceId);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard
};
