const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true,
    index: true,
  },
  currentPlan: {
    type: String,
    enum: ['Starter', 'Professional', 'Business', 'Enterprise'],
    required: true,
    default: 'Starter',
    index: true,
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly', 'custom'],
    default: 'monthly',
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    default: null,
  },
  nextBillingDate: {
    type: Date,
    default: null,
  },
  paymentStatus: {
    type: String,
    enum: ['free', 'pending', 'paid', 'failed', 'cancelled', 'suspended'],
    default: 'free',
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'suspended', 'expired'],
    default: 'active',
    index: true,
  },
  autoRenew: {
    type: Boolean,
    default: true,
  },
  transactionId: {
    type: String,
    default: '',
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  suspendedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
