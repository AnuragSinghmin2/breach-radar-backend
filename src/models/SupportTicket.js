const mongoose = require('mongoose');
const Counter = require('./Counter');
const { validateEmailFormat } = require('../utils/validators');
const {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_SOURCES
} = require('../constants');

async function generateTicketNumber() {
  const counter = await Counter.findOneAndUpdate(
    { key: 'supportTicket' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `PTR-${String(counter.seq).padStart(6, '0')}`;
}

const SupportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    index: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Name is required.'],
    trim: true,
    maxlength: [120, 'Name cannot exceed 120 characters.']
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    lowercase: true,
    trim: true,
    validate: {
      validator: validateEmailFormat,
      message: 'Enter a valid email address.'
    },
    index: true
  },
  company: {
    type: String,
    trim: true,
    maxlength: [120, 'Company cannot exceed 120 characters.'],
    default: ''
  },
  subject: {
    type: String,
    required: [true, 'Subject is required.'],
    trim: true,
    maxlength: [150, 'Subject cannot exceed 150 characters.'],
    index: true
  },
  category: {
    type: String,
    required: [true, 'Category is required.'],
    enum: {
      values: SUPPORT_TICKET_CATEGORIES,
      message: 'Invalid support ticket category.'
    },
    index: true
  },
  priority: {
    type: String,
    enum: {
      values: SUPPORT_TICKET_PRIORITIES,
      message: 'Invalid support ticket priority.'
    },
    default: 'Medium',
    index: true
  },
  message: {
    type: String,
    required: [true, 'Message is required.'],
    trim: true,
    minlength: [20, 'Message must be at least 20 characters.'],
    maxlength: [2000, 'Message cannot exceed 2000 characters.']
  },
  attachment: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: {
      values: SUPPORT_TICKET_STATUSES,
      message: 'Invalid support ticket status.'
    },
    default: 'Open',
    index: true
  },
  source: {
    type: String,
    enum: {
      values: SUPPORT_TICKET_SOURCES,
      message: 'Invalid support ticket source.'
    },
    default: 'Landing Page',
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Admin notes cannot exceed 5000 characters.'],
    default: ''
  },
  ipAddress: {
    type: String,
    trim: true,
    default: ''
  },
  userAgent: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

SupportTicketSchema.pre('validate', async function assignTicketNumber(next) {
  try {
    if (!this.ticketNumber) {
      this.ticketNumber = await generateTicketNumber();
    }
    next();
  } catch (error) {
    next(error);
  }
});

SupportTicketSchema.index({
  ticketNumber: 'text',
  name: 'text',
  email: 'text',
  subject: 'text'
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
