const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Starter', 'Professional', 'Business', 'Enterprise'],
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  billingInterval: {
    type: String,
    enum: ['month', 'custom'],
    default: 'month'
  },
  seatLimit: {
    type: Number,
    default: 1
  },
  domainLimit: {
    type: Number,
    required: true,
    default: 1
  },
  scanLimit: {
    type: Number,
    required: true,
    default: 5
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  features: [{
    type: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
