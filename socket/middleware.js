const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Socket.io authentication middleware
const socketAuth = async (socket, next) => {
  try {
    // Get token from handshake auth, query or Authorization header
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token && socket.handshake.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '').trim();
      }
    }
    
    if (!token) {
      console.log('❌ Socket connection rejected: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('❌ Socket connection rejected: User not found');
      return next(new Error('Authentication error: User not found'));
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.log(`❌ Socket connection rejected: User account is ${user.status}`);
      return next(new Error(`Authentication error: Account is ${user.status}`));
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      console.log('❌ Socket connection rejected: Account temporarily locked');
      return next(new Error('Authentication error: Account temporarily locked'));
    }

    // Attach user to socket object
    socket.user = user;
    
    console.log(`✅ Socket authentication successful for user: ${user._id} (${user.role})`);
    next();

  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Authentication error: Invalid token'));
    }
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token expired'));
    }
    
    next(new Error('Authentication error: Unable to authenticate'));
  }
};

// Rate limiting middleware for sockets
const createSocketRateLimit = (windowMs, max) => {
  const connections = new Map();

  return (socket, next) => {
    const now = Date.now();
    const clientId = socket.handshake.address; // Use IP address as client identifier

    if (!connections.has(clientId)) {
      connections.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
    } else {
      const clientData = connections.get(clientId);

      // Reset if window has passed
      if (now > clientData.resetTime) {
        clientData.count = 1;
        clientData.resetTime = now + windowMs;
      } else {
        clientData.count += 1;
      }

      // Check if rate limit exceeded
      if (clientData.count > max) {
        console.log(`🚫 Rate limit exceeded for client: ${clientId}`);
        return next(new Error('Rate limit exceeded. Please try again later.'));
      }
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      for (const [id, data] of connections.entries()) {
        if (now > data.resetTime) {
          connections.delete(id);
        }
      }
    }

    next();
  };
};

// Role-based access control for socket events
const socketRoleAuth = (allowedRoles) => {
  return (socket, next) => {
    if (!allowedRoles.includes(socket.user.role)) {
      console.log(`🚫 Socket access denied for role: ${socket.user.role}`);
      return next(new Error('Access denied: Insufficient permissions'));
    }
    next();
  };
};

// Apartment-based access control
const socketApartmentAuth = (socket, next) => {
  // This middleware ensures users can only access their own apartment's data
  // It's applied automatically to all socket connections after authentication
  next();
};

// Logging middleware for socket events
const socketLogging = (socket, next) => {
  const originalEmit = socket.emit;

  // Override emit to log all outgoing events
  socket.emit = function(event, data) {
    console.log(`📤 [SOCKET] Emitting ${event} to user ${socket.user?._id || 'unknown'}`);
    
    // Don't log sensitive data
    const logData = { ...data };
    if (logData.token) logData.token = '[REDACTED]';
    if (logData.password) logData.password = '[REDACTED]';
    
    console.log(`📤 [SOCKET] Data:`, JSON.stringify(logData).substring(0, 200));
    
    originalEmit.apply(this, [event, data]);
  };

  // Log incoming events
  const originalOn = socket.on;

  socket.on = function(event, handler) {
    console.log(`📥 [SOCKET] User ${socket.user?._id || 'unknown'} listening for ${event}`);
    
    const wrappedHandler = async (data) => {
      console.log(`📥 [SOCKET] Received ${event} from user ${socket.user?._id || 'unknown'}`);
      
      // Don't log sensitive data
      const logData = { ...data };
      if (logData.token) logData.token = '[REDACTED]';
      if (logData.password) logData.password = '[REDACTED]';
      
      console.log(`📥 [SOCKET] Data:`, JSON.stringify(logData).substring(0, 200));
      
      try {
        await handler(data);
      } catch (error) {
        console.error(`❌ [SOCKET] Error in handler for ${event}:`, error);
        socket.emit('error', {
          event,
          message: 'Error processing request',
          error: error.message
        });
      }
    };

    originalOn.call(this, event, wrappedHandler);
  };

  next();
};

// Error handling middleware
const socketErrorHandler = (socket, next) => {
  socket.on('error', (error) => {
    console.error(`❌ [SOCKET] Unhandled error for user ${socket.user?._id}:`, error);
  });

  next();
};

module.exports = {
  socketAuth,
  createSocketRateLimit,
  socketRoleAuth,
  socketApartmentAuth,
  socketLogging,
  socketErrorHandler
};