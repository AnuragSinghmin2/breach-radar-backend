const ApiKey = require('../models/ApiKey');
const crypto = require('crypto');
const { logRequestAudit } = require('../services/audit.service');

const getApiAccess = async (req, res, next) => {
  try {
    const keys = await ApiKey.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });

    const totalKeys = keys.filter(k => k.status === 'active').length;
    const totalRequests = keys.reduce((sum, k) => sum + k.usageCount, 0);

    res.status(200).json({
      keys: keys.map(k => ({
        id: k._id,
        name: k.name,
        desc: k.desc,
        key: k.keyPrefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        status: k.status,
        usageCount: k.usageCount
      })),
      stats: {
        totalKeys,
        totalRequests,
        successRate: '99.8%',
        avgResponseTime: '245ms'
      }
    });
  } catch (error) {
    next(error);
  }
};

const generateApiKey = async (req, res, next) => {
  try {
    const { name, desc } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'API key name is required.' });
    }

    const randomStr = crypto.randomBytes(24).toString('hex');
    const fullKey = `br_live_${randomStr}`;

    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = `br_live_${randomStr.slice(0, 4)}....................${randomStr.slice(-4)}`;

    const newKey = await ApiKey.create({
      userId: req.user._id,
      workspaceId: req.workspaceId,
      name,
      desc: desc || '',
      keyHash,
      keyPrefix,
      status: 'active'
    });

    await logRequestAudit(req, 'API key scope updated', `Generated new API key: "${name}".`);

    res.status(201).json({
      message: 'API key generated successfully.',
      key: {
        id: newKey._id,
        name: newKey.name,
        desc: newKey.desc,
        key: fullKey,
        maskedKey: keyPrefix,
        createdAt: newKey.createdAt,
        status: newKey.status,
        usageCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
};

const regenerateApiKey = async (req, res, next) => {
  try {
    const { id } = req.params;
    const oldKey = await ApiKey.findOne({ _id: id, workspaceId: req.workspaceId });
    if (!oldKey) {
      return res.status(404).json({ message: 'API key not found.' });
    }

    const randomStr = crypto.randomBytes(24).toString('hex');
    const fullKey = `br_live_${randomStr}`;

    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = `br_live_${randomStr.slice(0, 4)}....................${randomStr.slice(-4)}`;

    oldKey.keyHash = keyHash;
    oldKey.keyPrefix = keyPrefix;
    oldKey.status = 'active';
    oldKey.usageCount = 0;
    oldKey.lastUsedAt = null;
    await oldKey.save();

    await logRequestAudit(req, 'API key scope updated', `Regenerated API key: "${oldKey.name}".`);

    res.status(200).json({
      message: 'API key regenerated successfully.',
      key: {
        id: oldKey._id,
        name: oldKey.name,
        desc: oldKey.desc,
        key: fullKey,
        maskedKey: keyPrefix,
        createdAt: oldKey.createdAt,
        status: oldKey.status,
        usageCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
};

const revokeApiKey = async (req, res, next) => {
  try {
    const { id } = req.params;
    const key = await ApiKey.findOne({ _id: id, workspaceId: req.workspaceId });
    if (!key) {
      return res.status(404).json({ message: 'API key not found.' });
    }

    key.status = 'revoked';
    await key.save();

    await logRequestAudit(req, 'API key scope updated', `Revoked API key: "${key.name}".`);

    res.status(200).json({ message: 'API key revoked successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getApiAccess,
  generateApiKey,
  regenerateApiKey,
  revokeApiKey
};
