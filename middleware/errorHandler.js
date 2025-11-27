const { logAuditEvent } = require('../services/realtimeUpdateService');
const AuditLog = require('../models/AuditLog');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.details = details;
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  // Log error
  console.error('❌ Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?._id || 'anonymous'
  });
  
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new NotFoundError(message);
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `Duplicate field value: ${field} '${value}' already exists`;
    error = new ConflictError(message);
  }
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => ({
      field: el.path,
      message: el.message
    }));
    const message = 'Validation failed';
    error = new ValidationError(message, errors);
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthenticationError(message);
  }
  
  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthenticationError(message);
  }
  
  // Rate limit error
  if (err.name === 'RateLimitError') {
    error = new RateLimitError(err.message);
  }
  
  // Log audit event for operational errors
  if (error.isOperational !== false && req.user) {
    logAuditEvent({
      action: 'ERROR_OCCURRED',
      description: `Error: ${error.message}`,
      performedBy: req.user._id,
      targetEntity: 'System',
      severity: 'High',
      success: false,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        statusCode: error.statusCode
      },
      metadata: {
        url: req.originalUrl,
        method: req.method,
        userAgent: req.get('User-Agent')
      }
    }).catch(logError => {
      console.error('Failed to log audit event for error:', logError);
    });
  }
  
  // Send error response
  const errorResponse = {
    success: false,
    message: error.message || 'Internal Server Error',
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      error: error
    })
  };
  
  // Include error code if available
  if (error.code) {
    errorResponse.code = error.code;
  }
  
  res.status(error.statusCode || 500).json(errorResponse);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// Security error handler
const securityErrorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload'
    });
  }
  
  next(err);
};

// Database connection error handler
const handleDatabaseError = (error) => {
  console.error('❌ Database connection error:', error);
  
  // Log critical error
  AuditLog.create({
    action: 'DATABASE_ERROR',
    description: 'Database connection failed',
    performedBy: null,
    targetEntity: 'System',
    severity: 'Critical',
    success: false,
    error: {
      message: error.message,
      code: error.code
    }
  }).catch(logError => {
    console.error('Failed to log database error:', logError);
  });
};

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Log critical error
  AuditLog.create({
    action: 'UNHANDLED_REJECTION',
    description: 'Unhandled promise rejection',
    performedBy: null,
    targetEntity: 'System',
    severity: 'Critical',
    success: false,
    error: {
      message: reason.message,
      stack: reason.stack
    }
  }).catch(logError => {
    console.error('Failed to log unhandled rejection:', logError);
  });
  
  // Exit process with failure
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  
  // Log critical error
  AuditLog.create({
    action: 'UNCAUGHT_EXCEPTION',
    description: 'Uncaught exception occurred',
    performedBy: null,
    targetEntity: 'System',
    severity: 'Critical',
    success: false,
    error: {
      message: error.message,
      stack: error.stack
    }
  }).catch(logError => {
    console.error('Failed to log uncaught exception:', logError);
  });
  
  // Exit process with failure
  process.exit(1);
});

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  securityErrorHandler,
  handleDatabaseError,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};