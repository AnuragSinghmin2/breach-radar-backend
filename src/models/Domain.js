const mongoose = require('mongoose');
const { DOMAIN_VERIFICATION_STATUS } = require('../constants');

const DomainSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  domain: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tag: {
    type: String,
    default: 'Primary'
  },
  status: {
    type: String,
    enum: ['Active', 'Needs Attention', 'Inactive'],
    default: 'Inactive'
  },
  statusDetail: {
    type: String,
    default: 'Pending domain verification'
  },
  verificationStatus: {
    type: String,
    enum: Object.values(DOMAIN_VERIFICATION_STATUS),
    default: DOMAIN_VERIFICATION_STATUS.PENDING,
    index: true
  },
  verificationToken: {
    type: String,
    default: ''
  },
  verificationMethod: {
    type: String,
    enum: ['dns_txt', 'html_file', null],
    default: null
  },
  verifiedAt: {
    type: Date
  },
  lastVerificationAt: {
    type: Date
  },
  verificationAttempts: {
    type: Number,
    default: 0
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  scoreLabel: {
    type: String,
    default: 'Not Scanned'
  },
  scoreTone: {
    type: String,
    default: 'attention'
  },
  lastScanAt: {
    type: Date
  },
  sslExpiryDate: {
    type: Date,
    default: null
  },
  sslIssuer: {
    type: String,
    default: ''
  },
  sslLastCheckedAt: {
    type: Date,
    default: null
  },
  domainExpiryDate: {
    type: Date,
    default: null
  },
  domainRegistrar: {
    type: String,
    default: ''
  },
  domainLastCheckedAt: {
    type: Date,
    default: null
  },
  monitoringEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

DomainSchema.index({ workspaceId: 1, domain: 1 }, { unique: true });

module.exports = mongoose.model('Domain', DomainSchema);
