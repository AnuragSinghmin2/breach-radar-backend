const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  device: {
    type: String,
    default: 'Unknown Device'
  },
  location: {
    type: String,
    default: 'Unknown Location'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'expired'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Session', SessionSchema);
