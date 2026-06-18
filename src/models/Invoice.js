const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
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
    index: true,
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
  },
  planName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  tax: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  transactionId: {
    type: String,
    default: '',
  },
  pdfUrl: {
    type: String,
    default: '',
  },
  storageProvider: {
    type: String,
    enum: ['local', 's3'],
    default: 'local',
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  emailDeliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
    index: true,
  },
  emailDeliveryError: {
    type: String,
    default: '',
  },
  emailDeliveryAttempts: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Invoice', InvoiceSchema);
