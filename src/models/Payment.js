const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['succeeded', 'failed', 'refunded'],
    default: 'succeeded',
    index: true
  },
  planName: {
    type: String,
    required: true
  },
  transactionId: {
    type: String,
    unique: true,
    required: true
  },
  refunded: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', PaymentSchema);
