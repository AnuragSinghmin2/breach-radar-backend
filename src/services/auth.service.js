const User = require('../models/User');
const Workspace = require('../models/Workspace');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { validateEmailFormat } = require('../utils/validators');
const logger = require('../config/logger');
const teamService = require('./team.service');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const registerUser = async ({ email, password, name }) => {
  // 1. Inputs validation
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

  // 2. Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const err = new Error('A user with this email address already exists.');
    err.statusCode = 409;
    throw err;
  }

  // 3. Hash password
  const passwordHash = await hashPassword(password);

  // 4. Create User instance
  const user = new User({
    email,
    passwordHash,
    profile: { name, avatar: '', phoneNumber: '' }
  });

  // Save temporary user to obtain an ObjectId
  await user.save();

  // 5. Create default Workspace for user
  const workspace = new Workspace({
    name: `${name}'s Workspace`,
    owner: user._id,
    members: []
  });

  await workspace.save();

  // 6. Connect workspace with user defaults
  user.preferences.activeWorkspaceId = workspace._id;
  await user.save();
  await teamService.ensureOrganizationForUser(user);

  // 7. Sign JWT tokens
  const accessToken = generateAccessToken(user, workspace._id);
  const refreshToken = generateRefreshToken(user);

  logger.info(`New user registered: ${email} (Workspace ID: ${workspace._id})`);

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
  // 1. Input Validation
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Locate User
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

  // 3. Verify Password
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save();
  await teamService.recordLogin(user);

  // 4. Sign JWT Access & Refresh Tokens
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
  // 1. Input Validation
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Locate User
  const user = await User.findOne({ email });
  if (!user) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  // 3. Verify admin permissions
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

  // 4. Verify Password
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save();
  await teamService.recordLogin(user);

  // 5. Sign JWT Tokens
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

  return {
    accessToken,
    refreshToken: newRefreshToken
  };
};

module.exports = {
  hashPassword,
  verifyPassword,
  registerUser,
  loginUser,
  loginAdmin,
  refreshTokens
};
