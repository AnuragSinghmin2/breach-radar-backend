const mongoose = require('mongoose');

const TEAM_ROLES = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER', 'AUDITOR'];
const TEAM_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'];

const TeamMemberSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  role: {
    type: String,
    enum: TEAM_ROLES,
    required: true
  },
  status: {
    type: String,
    enum: TEAM_STATUSES,
    default: 'PENDING',
    index: true
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  joinedAt: {
    type: Date,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

TeamMemberSchema.index({ organizationId: 1, userId: 1 }, {
  unique: true,
  partialFilterExpression: { userId: { $type: 'objectId' } }
});

module.exports = mongoose.model('TeamMember', TeamMemberSchema);
module.exports.TEAM_ROLES = TEAM_ROLES;
module.exports.TEAM_STATUSES = TEAM_STATUSES;
