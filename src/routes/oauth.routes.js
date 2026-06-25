const express = require('express');
const router = express.Router();
const passport = require('passport');
const { generateAccessToken, generateRefreshToken, setTokensCookies } = require('../utils/jwt');
const logger = require('../config/logger');

// GET /api/v1/auth/google — Redirect to Google login
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

// GET /api/v1/auth/google/callback — Google redirects here after login
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      const accessToken = generateAccessToken(user, user.preferences?.activeWorkspaceId);
      const refreshToken = generateRefreshToken(user);

      setTokensCookies(res, accessToken, refreshToken);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // Redirect to frontend with token in URL (frontend will store it)
      res.redirect(`${frontendUrl}/auth/google/success?token=${accessToken}`);
    } catch (err) {
      logger.error(`[google-oauth] Callback error: ${err.message}`);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=google_failed`);
    }
  }
);

module.exports = router;
