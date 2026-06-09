const mongoose = require('mongoose');
const { SCAN_STATUS, SCAN_TYPES } = require('../constants');

const ScanSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    required: true,
    index: true
  },
  scanType: {
    type: String,
    enum: Object.values(SCAN_TYPES),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(SCAN_STATUS),
    default: SCAN_STATUS.QUEUED,
    index: true
  },
  triggeredBy: {
    type: mongoose.Schema.Types.Mixed, // ObjectId of User or 'system'
    default: 'system'
  },
  checks: {
    owasp: { type: Boolean, default: true },
    ssl: { type: Boolean, default: true },
    headers: { type: Boolean, default: true },
    ports: { type: Boolean, default: false },
    malware: { type: Boolean, default: true },
    compliance: { type: Boolean, default: false }
  },
  scheduledTime: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  vulnerabilitiesCount: {
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 }
  },
  riskScore: {
    type: Number,
    default: 0
  },
  errorDetail: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Scan', ScanSchema);
