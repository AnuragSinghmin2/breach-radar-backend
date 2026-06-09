const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication token required' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_access_key_12345!';
    
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token has expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'User profile not found' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'User account has been suspended' });
    }

    // Attach user information to request context
    req.user = user;
    
    // Inject current active workspace
    req.workspaceId = decoded.activeWorkspaceId || user.preferences.activeWorkspaceId;
    
    next();
  } catch (error) {
    logger.error(`Authentication middleware error: ${error.message}`);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = authenticateJWT;
