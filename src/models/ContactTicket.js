const mongoose = require('mongoose');

const CATEGORY_OPTIONS = [
  'Technical Issue',
  'Billing',
  'Sales',
  'Feature Request',
  'Bug Report',
  'General Inquiry',
  'Other',
];

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

const STATUS_OPTIONS = [
  'Open',
  'In Progress',
  'Waiting for Customer',
  'Resolved',
  'Closed',
];

const AttachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    storedName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    url: { type: String },
  },
  { _id: false }
);

const ContactTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      required: true,
      enum: CATEGORY_OPTIONS,
    },
    priority: {
      type: String,
      enum: PRIORITY_OPTIONS,
      default: 'Medium',
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 2000,
    },
    attachment: {
      type: AttachmentSchema,
      default: null,
    },
    status: {
      type: String,
      enum: STATUS_OPTIONS,
      default: 'Open',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    source: {
      type: String,
      default: 'Landing Page',
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

ContactTicketSchema.statics.CATEGORY_OPTIONS = CATEGORY_OPTIONS;
ContactTicketSchema.statics.PRIORITY_OPTIONS = PRIORITY_OPTIONS;
ContactTicketSchema.statics.STATUS_OPTIONS = STATUS_OPTIONS;

module.exports = mongoose.model('ContactTicket', ContactTicketSchema);