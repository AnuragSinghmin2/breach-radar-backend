const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Success', 'Failure'],
    default: 'Success'
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Only track creation timestamp
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
