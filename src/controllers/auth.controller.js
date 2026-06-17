const authService = require('../services/auth.service');
const { setTokensCookies } = require('../utils/jwt');
const logger = require('../config/logger');
const Session = require('../models/Session');
const { logAudit } = require('../services/audit.service');

const createUserSession = async (userId, token, req) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // Parse userAgent to get readable device information
    let device = 'Unknown Device';
    if (userAgent.includes('Chrome')) {
      device = 'Chrome on Windows';
    } else if (userAgent.includes('Firefox')) {
      device = 'Firefox on Windows';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      device = 'Safari on macOS';
    } else if (userAgent.includes('Mobile')) {
      device = 'Mobile App';
    }

    // Set a placeholder or mock city for demonstration
    const location = 'New Delhi, India';

    await Session.create({
      userId,
      token,
      userAgent,
      ipAddress,
      device,
      location,
      status: 'active'
    });

    await logAudit({
      userId,
      action: 'Login',
      description: `User logged in from ${device} (${ipAddress})`,
      ipAddress,
      userAgent
    });
  } catch (error) {
    logger.error(`Failed to create user session record: ${error.message}`);
  }
};

// POST /api/v1/auth/register
const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    
    const result = await authService.registerUser({ email, password, name });
    
    // Set refresh token in HttpOnly cookie
    setTokensCookies(res, result.accessToken, result.refreshToken);

    // Create session record
    await createUserSession(result.user.id, result.refreshToken, req);

    res.status(201).json({
      message: 'Registration successful',
      user: result.user,
      accessToken: result.accessToken
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const result = await authService.loginUser({ email, password });
    
    // Set refresh token in HttpOnly cookie
    setTokensCookies(res, result.accessToken, result.refreshToken);

    // Create session record
    await createUserSession(result.user.id, result.refreshToken, req);

    res.status(200).json({
      message: 'Login successful',
      user: result.user,
      accessToken: result.accessToken
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/admin-login
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const result = await authService.loginAdmin({ email, password });
    
    // Set refresh token in HttpOnly cookie
    setTokensCookies(res, result.accessToken, result.refreshToken);

    // Create session record
    await createUserSession(result.user.id, result.refreshToken, req);

    res.status(200).json({
      message: 'Admin login successful',
      user: result.user,
      accessToken: result.accessToken
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/refresh-token
const refreshToken = async (req, res, next) => {
  try {
    // Read token from cookie or request body
    const token = req.cookies?.refreshToken || req.body.refreshToken;
    
    const result = await authService.refreshTokens(token);
    
    // Rotate cookie
    setTokensCookies(res, result.accessToken, result.refreshToken);

    // Update active session token if exists
    if (token) {
      await Session.updateOne({ token }, { token: result.refreshToken, lastActivity: new Date() });
    }

    res.status(200).json({
      message: 'Token refreshed successfully',
      accessToken: result.accessToken
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/logout
const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body.refreshToken;
    if (token) {
      const session = await Session.findOne({ token });
      if (session) {
        await logAudit({
          userId: session.userId,
          action: 'Logout',
          description: 'User logged out',
          ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
          userAgent: req.headers['user-agent'] || ''
        }).catch(() => {});
        await Session.deleteOne({ _id: session._id });
      }
    }
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  adminLogin,
  refreshToken,
  logout
};

