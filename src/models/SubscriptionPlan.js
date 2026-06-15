const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  domainLimit: {
    type: Number,
    required: true,
    min: 0
  },
  scanLimit: {
    type: Number,
    required: true,
    min: 0
  },
  features: [{
    type: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
