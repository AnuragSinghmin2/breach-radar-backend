const mongoose = require('mongoose');
const { USER_ROLES } = require('../constants');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending_verification'],
    default: 'active'
  },
  profile: {
    name: { type: String, required: true },
    avatar: { type: String, default: '' },
    phoneNumber: { type: String, default: '' }
  },
  preferences: {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    dateFormat: { type: String, default: 'YYYY-MM-DD' },
    activeWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }
  },
  security: {
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: '' },
    lastPasswordChange: { type: Date, default: Date.now },
    sessionTimeoutMinutes: { type: Number, default: 60 },
    trustedIps: [{ type: String }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
