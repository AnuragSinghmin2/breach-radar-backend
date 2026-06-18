const userService = require('../services/user.service');

const getProfile = async (req, res, next) => {
  try {
    const user = await userService.getCurrentUserProfile(req.user._id);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const user = await userService.updateCurrentUserProfile(req.user._id, req.body);
    const { logRequestAudit } = require('../services/audit.service');
    await logRequestAudit(req, 'Profile Update', 'User updated their profile details.');
    res.status(200).json({
      message: 'Profile updated successfully.',
      user,
    });
  } catch (error) {
    next(error);
  }
};

const uploadAvatar = async (req, res, next) => {
  try {
    const user = await userService.updateCurrentUserAvatar(req.user._id, req.file);
    const { logRequestAudit } = require('../services/audit.service');
    await logRequestAudit(req, 'Profile Update', 'User updated their profile picture.');
    res.status(200).json({
      message: 'Profile picture updated successfully.',
      user,
    });
  } catch (error) {
    next(error);
  }
};

const removeAvatar = async (req, res, next) => {
  try {
    const user = await userService.removeCurrentUserAvatar(req.user._id);
    const { logRequestAudit } = require('../services/audit.service');
    await logRequestAudit(req, 'Profile Update', 'User removed their profile picture.');
    res.status(200).json({
      message: 'Profile picture removed successfully.',
      user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  removeAvatar,
};
