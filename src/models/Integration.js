const mongoose = require('mongoose');

const IntegrationSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  provider: {
    type: String,
    enum: ['slack', 'discord', 'msteams', 'webhook'],
    required: true
  },
  webhookUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['connected', 'disconnected'],
    default: 'connected'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Integration', IntegrationSchema);
