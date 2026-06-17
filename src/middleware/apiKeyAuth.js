const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const crypto = require('crypto');

const authenticateApiKey = async (req, res, next) => {
  try {
    let rawKey = req.headers['x-api-key'] || req.headers.authorization;
    if (!rawKey) {
      return res.status(401).json({ message: 'API Key is required.' });
    }

    if (rawKey.startsWith('Bearer ')) {
      rawKey = rawKey.split(' ')[1];
    }

    // Hash the input key to compare with the database
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    const keyDoc = await ApiKey.findOne({ keyHash: hashedKey, status: 'active' });
    if (!keyDoc) {
      return res.status(401).json({ message: 'Invalid or revoked API Key.' });
    }

    const user = await User.findById(keyDoc.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'User profile associated with this API key not found.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'User account has been suspended.' });
    }

    // Attach context to request
    req.user = user;
    req.workspaceId = keyDoc.workspaceId;

    // Track usage
    keyDoc.usageCount += 1;
    keyDoc.lastUsedAt = new Date();
    await keyDoc.save();

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = authenticateApiKey;
