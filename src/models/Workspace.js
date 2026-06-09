const mongoose = require('mongoose');
const { WORKSPACE_ROLES } = require('../constants');

const WorkspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    tier: {
      type: String,
      enum: ['Free', 'Professional', 'Enterprise'],
      default: 'Free'
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    paymentMethod: {
      cardBrand: { type: String, default: '' },
      last4: { type: String, default: '' }
    }
  },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: {
      type: String,
      enum: Object.values(WORKSPACE_ROLES),
      default: WORKSPACE_ROLES.ANALYST
    },
    invitedAt: { type: Date, default: Date.now },
    joinedAt: { type: Date }
  }],
  scanPreferences: {
    concurrencyLimit: { type: Number, default: 2 },
    depthLimit: { type: Number, default: 3 },
    agentLocation: { type: String, default: 'US-East' },
    timeoutMinutes: { type: Number, default: 15 },
    exclusions: [{ type: String }]
  },
  notifications: {
    channels: {
      slack: {
        enabled: { type: Boolean, default: false },
        webhookUrl: { type: String, default: '' }
      },
      email: {
        enabled: { type: Boolean, default: true },
        recipients: [{ type: String }]
      },
      webhook: {
        enabled: { type: Boolean, default: false },
        endpointUrl: { type: String, default: '' }
      },
      inApp: {
        enabled: { type: Boolean, default: true }
      }
    },
    events: {
      criticalFound: { type: Boolean, default: true },
      highFound: { type: Boolean, default: true },
      digestEnabled: { type: Boolean, default: false },
      digestFrequency: {
        type: String,
        enum: ['daily', 'weekly'],
        default: 'weekly'
      }
    }
  },
  integrations: {
    jira: {
      connected: { type: Boolean, default: false },
      projectKey: { type: String, default: '' },
      apiToken: { type: String, default: '' }
    },
    github: {
      connected: { type: Boolean, default: false },
      repoPath: { type: String, default: '' },
      installationId: { type: String, default: '' }
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Workspace', WorkspaceSchema);
