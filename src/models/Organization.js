const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subscriptionPlan: {
    type: String,
    enum: ['Starter', 'Professional', 'Business', 'Enterprise'],
    default: 'Starter'
  },
  maxSeats: {
    type: Number,
    default: 1
  },
  logo: {
    type: String,
    default: ''
  },
  companyWebsite: {
    type: String,
    default: ''
  },
  industry: {
    type: String,
    default: ''
  },
  timezone: {
    type: String,
    default: 'UTC'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Organization', OrganizationSchema);
