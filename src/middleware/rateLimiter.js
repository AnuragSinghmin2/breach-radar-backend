const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// General API request limiter (max 100 requests per minute)
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: {
    message: 'Too many requests from this client. Please try again after some time.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded by client IP: ${req.ip} on route: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Authentication endpoints limiter (max 10 logins / registration attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    message: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Auth Rate limit exceeded by IP: ${req.ip} on: ${req.originalUrl}`);
    res.status(options.statusCode).send(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  authLimiter
};
