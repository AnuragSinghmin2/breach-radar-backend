const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`Error occurred: ${message} - Status: ${statusCode}`);
  if (err.stack && process.env.NODE_ENV === 'development') {
    logger.error(err.stack);
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Database Validation Failed',
      errors: Object.values(err.errors).map((e) => e.message)
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      message: `Conflict: A record with this ${field} already exists.`
    });
  }

  res.status(statusCode).json({
    message,
    ...(err.code && { code: err.code }),
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
