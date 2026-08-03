const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const supportController = require('../controllers/support.controller');
const { handleSupportAttachmentUpload } = require('../middleware/supportUpload');
const logger = require('../config/logger');

// Dedicated limiter for the public support form to prevent spam/abuse.
// Kept local to this route file so no shared middleware file is modified.
const supportFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { message: 'Too many support requests from this device. Please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn(`[support] Rate limit exceeded by IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoint — no authentication required.
router.post('/', supportFormLimiter, handleSupportAttachmentUpload, supportController.createSupportTicket);

module.exports = router;