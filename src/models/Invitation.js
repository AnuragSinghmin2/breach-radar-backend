const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  role: {
    type: String,
    enum: ['ADMIN', 'ANALYST', 'VIEWER', 'AUDITOR'],
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    select: false
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'],
    default: 'PENDING',
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  acceptedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: true }
});

InvitationSchema.index({ organizationId: 1, email: 1, status: 1 });

module.exports = mongoose.model('Invitation', InvitationSchema);
