const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const { validateEmailFormat } = require('../utils/validators');
const {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_SOURCES
} = require('../constants');

const priorityRank = {
  High: 1,
  Medium: 2,
  Low: 3
};

const statusRank = {
  Open: 1,
  'In Progress': 2,
  'Waiting for Customer': 3,
  Resolved: 4,
  Closed: 5
};

const supportUploadPublicRoot = '/uploads/support-tickets';

function sanitizeString(value) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function validationError(errors) {
  const error = new Error('Validation failed.');
  error.statusCode = 400;
  error.details = errors;
  return error;
}

function normalizeTicketPayload(body = {}) {
  return {
    name: sanitizeString(body.name),
    email: sanitizeString(body.email).toLowerCase(),
    company: sanitizeString(body.company),
    subject: sanitizeString(body.subject),
    category: sanitizeString(body.category),
    priority: sanitizeString(body.priority || 'Medium'),
    message: sanitizeString(body.message),
    source: sanitizeString(body.source || 'Landing Page')
  };
}

function validateCreatePayload(payload) {
  const errors = [];

  if (!payload.name) errors.push('Name is required.');
  if (payload.name.length > 120) errors.push('Name cannot exceed 120 characters.');
  if (!payload.email) {
    errors.push('Email is required.');
  } else if (!validateEmailFormat(payload.email)) {
    errors.push('Enter a valid email address.');
  }
  if (payload.email.length > 254) errors.push('Email cannot exceed 254 characters.');
  if (payload.company.length > 120) errors.push('Company cannot exceed 120 characters.');
  if (!payload.subject) errors.push('Subject is required.');
  if (payload.subject.length > 150) errors.push('Subject cannot exceed 150 characters.');
  if (!SUPPORT_TICKET_CATEGORIES.includes(payload.category)) errors.push('Invalid support ticket category.');
  if (!SUPPORT_TICKET_PRIORITIES.includes(payload.priority)) errors.push('Invalid support ticket priority.');
  if (!payload.message) errors.push('Message is required.');
  if (payload.message && payload.message.length < 20) errors.push('Message must be at least 20 characters.');
  if (payload.message.length > 2000) errors.push('Message cannot exceed 2000 characters.');
  if (!SUPPORT_TICKET_SOURCES.includes(payload.source)) errors.push('Invalid support ticket source.');

  if (errors.length) throw validationError(errors);
}

async function createSupportTicket({ body, file, ipAddress, userAgent }) {
  const payload = normalizeTicketPayload(body);
  validateCreatePayload(payload);

  const ticket = await SupportTicket.create({
    ...payload,
    attachment: file ? pathForUpload(file.filename) : '',
    ipAddress: sanitizeString(ipAddress).slice(0, 80),
    userAgent: sanitizeString(userAgent).slice(0, 500)
  });

  return ticket;
}

function pathForUpload(filename) {
  return filename ? `${supportUploadPublicRoot}/${filename}` : '';
}

function buildTicketQuery(query = {}) {
  const filter = {};
  const search = sanitizeString(query.search).slice(0, 120);
  const status = sanitizeString(query.status).slice(0, 40);
  const priority = sanitizeString(query.priority).slice(0, 20);
  const category = sanitizeString(query.category).slice(0, 60);
  const dateFrom = query.dateFrom || query.from || query.startDate;
  const dateTo = query.dateTo || query.to || query.endDate;

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { ticketNumber: regex },
      { name: regex },
      { email: regex },
      { subject: regex }
    ];
  }

  if (status && status !== 'all') {
    if (!SUPPORT_TICKET_STATUSES.includes(status)) throw validationError(['Invalid support ticket status.']);
    filter.status = status;
  }

  if (priority && priority !== 'all') {
    if (!SUPPORT_TICKET_PRIORITIES.includes(priority)) throw validationError(['Invalid support ticket priority.']);
    filter.priority = priority;
  }

  if (category && category !== 'all') {
    if (!SUPPORT_TICKET_CATEGORIES.includes(category)) throw validationError(['Invalid support ticket category.']);
    filter.category = category;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      const parsedFrom = new Date(dateFrom);
      if (Number.isNaN(parsedFrom.getTime())) throw validationError(['Invalid dateFrom value.']);
      filter.createdAt.$gte = parsedFrom;
    }
    if (dateTo) {
      const parsedTo = new Date(dateTo);
      if (Number.isNaN(parsedTo.getTime())) throw validationError(['Invalid dateTo value.']);
      parsedTo.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = parsedTo;
    }
  }

  return filter;
}

function getSortConfig(sort) {
  const normalizedSort = sanitizeString(sort).slice(0, 40).toLowerCase();

  if (['oldest', 'oldest_first', 'created_asc'].includes(normalizedSort)) {
    return { createdAt: 1 };
  }
  if (['priority', 'priority_desc'].includes(normalizedSort)) {
    return { priorityWeight: 1, createdAt: -1 };
  }
  if (['status', 'status_asc'].includes(normalizedSort)) {
    return { statusWeight: 1, createdAt: -1 };
  }
  return { createdAt: -1 };
}

async function listSupportTickets(query) {
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const filter = buildTicketQuery(query);
  const sortConfig = getSortConfig(query.sort);

  const [tickets, total] = await Promise.all([
    SupportTicket.aggregate([
      { $match: filter },
      {
        $addFields: {
          priorityWeight: {
            $switch: {
              branches: Object.entries(priorityRank).map(([priority, rank]) => ({
                case: { $eq: ['$priority', priority] },
                then: rank
              })),
              default: 99
            }
          },
          statusWeight: {
            $switch: {
              branches: Object.entries(statusRank).map(([status, rank]) => ({
                case: { $eq: ['$status', status] },
                then: rank
              })),
              default: 99
            }
          }
        }
      },
      { $sort: sortConfig },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedTo'
        }
      },
      {
        $unwind: {
          path: '$assignedTo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          priorityWeight: 0,
          statusWeight: 0,
          'assignedTo.passwordHash': 0,
          'assignedTo.passwordResetToken': 0,
          'assignedTo.emailVerifyToken': 0
        }
      }
    ]),
    SupportTicket.countDocuments(filter)
  ]);

  return {
    tickets,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getSupportTicketById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid support ticket id.');
    error.statusCode = 400;
    throw error;
  }

  const ticket = await SupportTicket.findById(id)
    .populate('assignedTo', 'email profile.name role status');

  if (!ticket) {
    const error = new Error('Support ticket not found.');
    error.statusCode = 404;
    throw error;
  }

  return ticket;
}

async function updateSupportTicket(id, body = {}) {
  const ticket = await getSupportTicketById(id);
  const updates = {};
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = sanitizeString(body.status).slice(0, 40);
    if (!SUPPORT_TICKET_STATUSES.includes(status)) errors.push('Invalid support ticket status.');
    updates.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'assignedTo')) {
    const assignedTo = sanitizeString(body.assignedTo).slice(0, 80);
    if (!assignedTo) {
      updates.assignedTo = null;
    } else if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
      errors.push('Invalid assignedTo user id.');
    } else {
      const user = await User.findById(assignedTo).select('_id');
      if (!user) errors.push('Assigned user not found.');
      updates.assignedTo = assignedTo;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'adminNotes')) {
    updates.adminNotes = sanitizeString(body.adminNotes);
    if (updates.adminNotes.length > 5000) errors.push('Admin notes cannot exceed 5000 characters.');
  }

  if (errors.length) throw validationError(errors);

  Object.assign(ticket, updates);
  await ticket.save();
  return ticket.populate('assignedTo', 'email profile.name role status');
}

async function deleteSupportTicket(id) {
  const ticket = await getSupportTicketById(id);
  await SupportTicket.deleteOne({ _id: ticket._id });
  if (ticket.attachment) {
    const relativeAttachment = String(ticket.attachment).replace(/^\/+/, '');
    const attachmentPath = path.resolve(process.cwd(), relativeAttachment);
    const supportUploadRoot = path.resolve(process.cwd(), 'uploads', 'support-tickets');
    if (attachmentPath.startsWith(supportUploadRoot)) {
      fs.unlink(attachmentPath, () => {});
    }
  }
  return ticket;
}

module.exports = {
  createSupportTicket,
  listSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
  deleteSupportTicket,
  sanitizeString
};
