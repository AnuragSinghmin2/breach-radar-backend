const authService = require('../services/auth.service');
const { setTokensCookies } = require('../utils/jwt');
const logger = require('../config/logger');

// POST /api/v1/auth/register
const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    
    const result = await authService.registerUser({ email, password, name });
    
    // Set refresh token in HttpOnly cookie
    setTokensCookies(res, result.accessToken, result.refreshToken);

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

