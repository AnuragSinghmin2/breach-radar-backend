const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { logRequestAudit } = require('../services/audit.service');

const getNotifications = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    res.status(200).json(user.notifications || {});
  } catch (error) {
    next(error);
  }
};

const updateNotifications = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    user.notifications = {
      ...user.notifications,
      ...req.body
    };

    await user.save();
    await logRequestAudit(req, 'Profile Update', 'User updated notification preferences.');

    res.status(200).json({
      message: 'Notification settings updated successfully.',
      notifications: user.notifications
    });
  } catch (error) {
    next(error);
  }
};

const getScanPreferences = async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.workspaceId).select('scanPreferences');
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }
    res.status(200).json(workspace.scanPreferences || {});
  } catch (error) {
    next(error);
  }
};

const updateScanPreferences = async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    workspace.scanPreferences = {
      ...workspace.scanPreferences,
      ...req.body
    };

    await workspace.save();
    await logRequestAudit(req, 'Scan Start', 'Workspace scan preferences updated.');

    res.status(200).json({
      message: 'Scan preferences updated successfully.',
      scanPreferences: workspace.scanPreferences
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  updateNotifications,
  getScanPreferences,
  updateScanPreferences
};
