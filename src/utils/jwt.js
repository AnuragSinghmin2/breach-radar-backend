const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '30m';
const REFRESH_TOKEN_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '30d';
const REFRESH_TOKEN_EXPIRATION_SHORT = process.env.JWT_REFRESH_EXPIRATION_SHORT || '8h';

const REFRESH_COOKIE_MAX_AGE = {
  persistent: 30 * 24 * 60 * 60 * 1000,
  temporary: 8 * 60 * 60 * 1000,
};

function resolveRememberMe(rememberMe) {
  if (typeof rememberMe === 'boolean') return rememberMe;
  if (typeof rememberMe === 'string') {
    const normalized = rememberMe.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return true;
}

const generateAccessToken = (user, activeWorkspaceId = null) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_access_key_12345!';

  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      activeWorkspaceId: activeWorkspaceId || user.preferences.activeWorkspaceId,
    },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRATION }
  );
};

const generateRefreshToken = (user, { rememberMe = true } = {}) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_67890!';
  const persistentSession = resolveRememberMe(rememberMe);
  const expiresIn = persistentSession ? REFRESH_TOKEN_EXPIRATION : REFRESH_TOKEN_EXPIRATION_SHORT;

  return jwt.sign(
    {
      userId: user._id,
      rememberMe: persistentSession,
    },
    secret,
    { expiresIn }
  );
};

const setTokensCookies = (res, accessToken, refreshToken, { rememberMe = true } = {}) => {
  const persistentSession = resolveRememberMe(rememberMe);
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Strict',
    maxAge: persistentSession ? REFRESH_COOKIE_MAX_AGE.persistent : REFRESH_COOKIE_MAX_AGE.temporary,
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setTokensCookies,
  resolveRememberMe,
};
