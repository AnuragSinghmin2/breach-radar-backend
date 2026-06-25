const User = require('../models/User');
const Workspace = require('../models/Workspace');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { validateEmailFormat } = require('../utils/validators');
const logger = require('../config/logger');
const teamService = require('./team.service');
const { sendEmail, sendWelcomeEmail } = require('./email/resend.service');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const registerUser = async ({ email, password, name }) => {
  if (!email || !password || !name) {
    const err = new Error('Email, password, and name are required.');
    err.statusCode = 400;
    throw err;
  }

  if (!validateEmailFormat(email)) {
    const err = new Error('Invalid email address format.');
    err.statusCode = 400;
    throw err;
  }

  if (password.length < 8) {
    const err = new Error('Password must be at least 8 characters long.');
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const err = new Error('A user with this email address already exists.');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);

  const user = new User({
    email,
    passwordHash,
    profile: { name, avatar: '', phoneNumber: '' }
  });

  await user.save();

  const workspace = new Workspace({
    name: `${name}'s Workspace`,
    owner: user._id,
    members: []
  });

  await workspace.save();

  user.preferences.activeWorkspaceId = workspace._id;
  await user.save();
  await teamService.ensureOrganizationForUser(user);

  const accessToken = generateAccessToken(user, workspace._id);
  const refreshToken = generateRefreshToken(user);

  logger.info(`New user registered: ${email} (Workspace ID: ${workspace._id})`);

  // Send welcome email (non-blocking — don't fail registration if email fails)
  sendWelcomeEmail({ to: email, name }).catch((err) => {
    logger.warn(`[register] Welcome email failed for ${email}: ${err.message}`);
  });

  return {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile,
      preferences: user.preferences,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    },
    accessToken,
    refreshToken
  };
};

const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email });
  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (user.status === 'suspended') {
    const err = new Error('Your account has been suspended.');
    err.statusCode = 403;
    throw err;
  }

  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save();
  await teamService.recordLogin(user);

  const activeWorkspaceId = user.preferences.activeWorkspaceId;
  const accessToken = generateAccessToken(user, activeWorkspaceId);
  const refreshToken = generateRefreshToken(user);

  logger.info(`User logged in: ${email}`);

  return {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile,
      preferences: user.preferences,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    },
    accessToken,
    refreshToken
  };
};

const loginAdmin = async ({ email, password }) => {
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email });
  if (!user) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    logger.warn(`Unauthorized admin panel login attempt from: ${email}`);
    const err = new Error('Access denied: Administrative privileges required.');
    err.statusCode = 403;
    throw err;
  }

  if (user.status === 'suspended') {
    const err = new Error('Account suspended.');
    err.statusCode = 403;
    throw err;
  }

  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save();
  await teamService.recordLogin(user);

  const accessToken = generateAccessToken(user, user.preferences.activeWorkspaceId);
  const refreshToken = generateRefreshToken(user);

  logger.info(`Admin logged in: ${email} (Role: ${user.role})`);

  return {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile,
      preferences: user.preferences,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    },
    accessToken,
    refreshToken
  };
};

const refreshTokens = async (token) => {
  if (!token) {
    const err = new Error('Refresh token is required.');
    err.statusCode = 400;
    throw err;
  }

  const secret = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_67890!';

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    const error = new Error('Invalid or expired refresh token.');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 401;
    throw err;
  }

  if (user.status === 'suspended') {
    const err = new Error('User account is suspended.');
    err.statusCode = 403;
    throw err;
  }

  const accessToken = generateAccessToken(user, user.preferences.activeWorkspaceId);
  const newRefreshToken = generateRefreshToken(user);

  return { accessToken, refreshToken: newRefreshToken };
};

// ─── PASSWORD RESET — NEW FUNCTIONS ───────────────────────────────────────────

const forgotPassword = async ({ email }) => {
  if (!email) {
    const err = new Error('Email is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!validateEmailFormat(email)) {
    const err = new Error('Invalid email address format.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  // Security: same response whether user exists or not (prevents email enumeration)
  if (!user) {
    logger.info(`[forgot-password] Email not found (silent): ${email}`);
    return { message: 'If this email exists, a reset link has been sent.' };
  }

  // Generate secure random token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Save hashed token to DB — expires in 1 hour
  user.passwordResetToken = resetTokenHash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  // Build reset link
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

  // Send email
  const html = `
    <div style="margin:0;background:#07111f;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#f8fafc">
      <div style="max-width:620px;margin:0 auto;background:#0b1728;border:1px solid #20324a;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff">Reset Your Password</h1>
        <p style="margin:0 0 22px;color:#aeb8c7;line-height:1.6">
          We received a request to reset the password for your Breach Radar account.
          Click the button below to set a new password.
        </p>
        <div style="background:#091421;border:1px solid #20324a;border-radius:10px;padding:18px;margin-bottom:22px">
          <p style="margin:0 0 8px;color:#aeb8c7">Account Email</p>
          <strong style="display:block;margin-bottom:16px;font-size:18px;color:#ffffff">${email}</strong>
          <p style="margin:0 0 8px;color:#aeb8c7">Link Expires In</p>
          <strong style="display:block;color:#16e095">1 Hour</strong>
        </div>
        <a href="${resetUrl}" style="display:inline-block;background:#16e095;color:#04120d;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:8px">
          Reset Password
        </a>
        <p style="margin:24px 0 0;color:#aeb8c7;font-size:13px;line-height:1.6">
          If you did not request this, you can safely ignore this email. Your password will not change.<br><br>
          If the button does not work, copy and paste this link:<br>
          <a href="${resetUrl}" style="color:#16e095">${resetUrl}</a>
        </p>
      </div>
    </div>
  `;

  const text = `Reset Your Password\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`;

  try {
    await sendEmail({
      to: email,
      subject: 'Breach Radar — Reset Your Password',
      html,
      text
    });
    logger.info(`[forgot-password] Reset email sent to: ${email}`);
  } catch (emailErr) {
    // Clear token if email fails
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    logger.error(`[forgot-password] Email send failed for ${email}: ${emailErr.message}`);
    const err = new Error('Failed to send reset email. Please try again.');
    err.statusCode = 503;
    throw err;
  }

  return { message: 'If this email exists, a reset link has been sent.' };
};

const resetPassword = async ({ token, email, newPassword }) => {
  if (!token || !email || !newPassword) {
    const err = new Error('Token, email, and new password are required.');
    err.statusCode = 400;
    throw err;
  }

  if (newPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters long.');
    err.statusCode = 400;
    throw err;
  }

  // Hash the incoming token to compare with stored hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() } // Not expired
  });

  if (!user) {
    const err = new Error('Invalid or expired reset link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  // Set new password
  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.security.lastPasswordChange = new Date();
  await user.save();

  logger.info(`[reset-password] Password reset successful for: ${email}`);

  return { message: 'Password has been reset successfully. You can now log in.' };
};

module.exports = {
  hashPassword,
  verifyPassword,
  registerUser,
  loginUser,
  loginAdmin,
  refreshTokens,
  forgotPassword,
  resetPassword
};
