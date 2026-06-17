const mongoose = require('mongoose');

const ApiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  desc: {
    type: String,
    default: ''
  },
  keyHash: {
    type: String,
    required: true
  },
  keyPrefix: {
    type: String,
    required: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active'
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ApiKey', ApiKeySchema);
