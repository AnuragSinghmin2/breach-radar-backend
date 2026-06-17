const User = require('../models/User');
const Session = require('../models/Session');
const bcrypt = require('bcryptjs');
const { logRequestAudit } = require('../services/audit.service');

const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new passwords are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      await logRequestAudit(req, 'Password Change', 'Failed password change attempt: incorrect current password.', 'Failure');
      return res.status(400).json({ message: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.security.lastPasswordChange = new Date();
    await user.save();

    await logRequestAudit(req, 'Password Change', 'User changed their password successfully.');

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
};

const enable2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.security.mfaEnabled = true;
    user.security.mfaSecret = `br_mfa_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    await user.save();

    await logRequestAudit(req, 'Security', 'Enabled two-factor authentication.');

    res.status(200).json({
      message: 'Two-factor authentication enabled successfully.',
      mfaSecret: user.security.mfaSecret
    });
  } catch (error) {
    next(error);
  }
};

const disable2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.security.mfaEnabled = false;
    user.security.mfaSecret = '';
    await user.save();

    await logRequestAudit(req, 'Security', 'Disabled two-factor authentication.');

    res.status(200).json({ message: 'Two-factor authentication disabled successfully.' });
  } catch (error) {
    next(error);
  }
};

const getSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    
    // Read current refresh token or authorization header
    const currentToken = req.cookies?.refreshToken || req.headers.authorization?.split(' ')[1] || '';
    
    const mapped = sessions.map(s => ({
      id: s._id,
      device: s.device,
      ipAddress: s.ipAddress,
      location: s.location,
      lastActivity: s.lastActivity,
      isCurrent: s.token === currentToken,
      status: s.status
    }));

    res.status(200).json(mapped);
  } catch (error) {
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentToken = req.cookies?.refreshToken || req.headers.authorization?.split(' ')[1] || '';

    if (id === 'all') {
      await Session.deleteMany({ userId: req.user._id, token: { $ne: currentToken } });
      await logRequestAudit(req, 'Security', 'Revoked all other active sessions.');
    } else {
      const session = await Session.findOne({ _id: id, userId: req.user._id });
      if (!session) {
        return res.status(404).json({ message: 'Session not found or unauthorized.' });
      }
      
      await Session.deleteOne({ _id: id });
      await logRequestAudit(req, 'Security', `Revoked device session: ${session.device} (${session.ipAddress}).`);
    }

    res.status(200).json({ message: 'Session terminated successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  changePassword,
  enable2FA,
  disable2FA,
  getSessions,
  revokeSession
};
