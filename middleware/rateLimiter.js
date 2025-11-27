const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { RateLimitError } = require('./errorHandler');

// Redis client for distributed rate limiting
const redisClient = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: 'localhost',
      port: 6379,
      retryDelayOnFailover: 100
    });

// Redis store for rate limiting
const RedisStore = require('rate-limit-redis');
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'ratelimit:'
});

// Generic rate limiter
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    store: redisStore,
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests, please try again later.'
    },
    handler: (req, res) => {
      throw new RateLimitError(message || 'Too many requests');
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Specific rate limiters for different routes

// Strict limiter for sensitive operations
const strictLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 requests per window
  'Too many attempts, please try again after 15 minutes'
);

// Auth limiter for login/registration
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // 10 attempts per window
  'Too many authentication attempts, please try again later'
);

// OTP limiter
const otpLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  3, // 3 OTP requests per minute
  'Too many OTP requests, please wait a minute'
);

// Complaint limiter
const complaintLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  20, // 20 complaints per hour
  'Too many complaints created, please try again later'
);

// API general limiter
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many API requests, please slow down'
);

// File upload limiter
const uploadLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 uploads per hour
  'Too many file uploads, please try again later'
);

// Notice limiter for admins
const noticeLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  50, // 50 notices per hour
  'Too many notices created, please slow down'
);

// Password reset limiter
const passwordResetLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // 3 password reset attempts per hour
  'Too many password reset attempts, please try again later'
);

// Dynamic rate limiter based on user role
const dynamicRateLimiter = (req, res, next) => {
  let windowMs, max;
  
  switch (req.user?.role) {
    case 'admin':
      windowMs = 15 * 60 * 1000; // 15 minutes
      max = 500; // 500 requests
      break;
    case 'staff':
      windowMs = 15 * 60 * 1000; // 15 minutes
      max = 300; // 300 requests
      break;
    case 'resident':
      windowMs = 15 * 60 * 1000; // 15 minutes
      max = 200; // 200 requests
      break;
    default:
      windowMs = 15 * 60 * 1000; // 15 minutes
      max = 100; // 100 requests for unauthenticated
  }
  
  return createRateLimiter(windowMs, max)(req, res, next);
};

// IP-based rate limiter for brute force protection
const ipBasedLimiter = rateLimit({
  store: redisStore,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per IP per hour
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  skip: (req) => {
    // Skip rate limiting for trusted IPs (admin networks, etc.)
    const trustedIPs = process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(',') : [];
    return trustedIPs.includes(req.ip);
  }
});

// Rate limiter for specific endpoints with custom keys
const endpointSpecificLimiter = (endpoint, windowMs, max) => {
  return rateLimit({
    store: redisStore,
    windowMs,
    max,
    keyGenerator: (req) => {
      return `${endpoint}:${req.ip}`;
    },
    message: {
      success: false,
      message: `Too many requests to ${endpoint}, please try again later.`
    }
  });
};

// Rate limit analytics
const getRateLimitStats = async () => {
  try {
    const keys = await redisClient.keys('ratelimit:*');
    const stats = {};
    
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        stats[key] = {
          totalHits: parsed.totalHits,
          resetTime: new Date(parsed.resetTime),
          remainingHits: parsed.remainingHits
        };
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error getting rate limit stats:', error);
    return {};
  }
};

// Clean up old rate limit records
const cleanupRateLimitRecords = async (olderThanHours = 24) => {
  try {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const keys = await redisClient.keys('ratelimit:*');
    
    let deletedCount = 0;
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.resetTime < cutoffTime) {
          await redisClient.del(key);
          deletedCount++;
        }
      }
    }
    
    console.log(`🧹 Cleaned up ${deletedCount} old rate limit records`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up rate limit records:', error);
    return 0;
  }
};

module.exports = {
  createRateLimiter,
  strictLimiter,
  authLimiter,
  otpLimiter,
  complaintLimiter,
  apiLimiter,
  uploadLimiter,
  noticeLimiter,
  passwordResetLimiter,
  dynamicRateLimiter,
  ipBasedLimiter,
  endpointSpecificLimiter,
  getRateLimitStats,
  cleanupRateLimitRecords,
  redisClient
};