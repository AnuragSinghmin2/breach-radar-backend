const mongoose = require('mongoose');
const { ALERT_TYPES, ALERT_STATUS, SEVERITY_LEVELS } = require('../constants');

const AlertSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    default: null,
    index: true
  },
  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scan',
    default: null
  },
  type: {
    type: String,
    enum: Object.values(ALERT_TYPES),
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: Object.values(SEVERITY_LEVELS),
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: Object.values(ALERT_STATUS),
    default: ALERT_STATUS.ACTIVE,
    index: true
  },
  dedupeKey: {
    type: String,
    required: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date,
    default: null
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

AlertSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
AlertSchema.index({ workspaceId: 1, dedupeKey: 1, status: 1 });

module.exports = mongoose.model('Alert', AlertSchema);
