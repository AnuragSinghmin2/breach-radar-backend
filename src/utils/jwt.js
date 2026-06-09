const jwt = require('jsonwebtoken');

const generateAccessToken = (user, activeWorkspaceId = null) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_access_key_12345!';
  const expiresIn = process.env.JWT_ACCESS_EXPIRATION || '15m';

  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      activeWorkspaceId: activeWorkspaceId || user.preferences.activeWorkspaceId
    },
    secret,
    { expiresIn }
  );
};

const generateRefreshToken = (user) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_67890!';
  const expiresIn = process.env.JWT_REFRESH_EXPIRATION || '7d';

  return jwt.sign(
    { userId: user._id },
    secret,
    { expiresIn }
  );
};

const setTokensCookies = (res, accessToken, refreshToken) => {
  // Option to set refresh token via httpOnly cookie
  const isProd = process.env.NODE_ENV === 'production';
  
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setTokensCookies
};
