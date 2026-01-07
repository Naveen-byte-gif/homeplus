let io;
const User = require('../models/User');

const initializeSocket = (socketIO) => {
  io = socketIO;
  
  // Socket middleware for authentication
  const { socketAuth } = require('../middleware/auth');
  io.use(socketAuth);

  // Socket connection handling
  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`✅ [SOCKET] User ${userId} connected`);
    console.log(`✅ [SOCKET] User role: ${socket.user.role}`);
    console.log(`✅ [SOCKET] User apartment: ${socket.user.apartmentCode}`);

    // Update user presence to online
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${userId}`);
    console.log(`✅ [SOCKET] User ${userId} joined personal room: user_${userId}`);

    // Join user to role-based rooms
    socket.join(socket.user.role);
    console.log(`✅ [SOCKET] User ${userId} joined role room: ${socket.user.role}`);

    // Join user to apartment room (only if they have apartment code)
    if (socket.user.apartmentCode) {
      socket.join(`apartment_${socket.user.apartmentCode}`);
      console.log(`✅ [SOCKET] User ${userId} joined apartment room: apartment_${socket.user.apartmentCode}`);
    } else {
      console.log(`ℹ️ [SOCKET] User ${userId} has no apartment code (admin without apartment)`);
    }

    // Broadcast user online status
    if (socket.user.apartmentCode) {
      emitToRoom(`apartment_${socket.user.apartmentCode}`, 'user_online', {
        userId,
        isOnline: true,
        lastSeen: new Date()
      });
    }

    // Allow admin to join specific apartment rooms dynamically
    socket.on('join_apartment', (apartmentCode) => {
      if (socket.user.role === 'admin' && apartmentCode) {
        socket.join(`apartment_${apartmentCode}`);
        console.log(`✅ [SOCKET] Admin ${userId} joined apartment room: apartment_${apartmentCode}`);
      }
    });

    // Allow admin to leave specific apartment rooms
    socket.on('leave_apartment', (apartmentCode) => {
      if (socket.user.role === 'admin' && apartmentCode) {
        socket.leave(`apartment_${apartmentCode}`);
        console.log(`✅ [SOCKET] Admin ${userId} left apartment room: apartment_${apartmentCode}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`❌ [SOCKET] User ${userId} disconnected`);
      
      // Update user presence to offline
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });

      // Broadcast user offline status
      if (socket.user.apartmentCode) {
        emitToRoom(`apartment_${socket.user.apartmentCode}`, 'user_offline', {
          userId,
          isOnline: false,
          lastSeen: new Date()
        });
      }
    });

    // Handle custom events
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`✅ [SOCKET] User ${userId} joined room: ${room}`);
    });

    socket.on('leave_room', (room) => {
      socket.leave(room);
      console.log(`✅ [SOCKET] User ${userId} left room: ${room}`);
    });

    // Chat-specific room joining
    socket.on('join_chat_room', (roomName) => {
      socket.join(roomName);
      console.log(`✅ [SOCKET] User ${userId} joined chat room: ${roomName}`);
    });

    socket.on('leave_chat_room', (roomName) => {
      socket.leave(roomName);
      console.log(`✅ [SOCKET] User ${userId} left chat room: ${roomName}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('❌ [SOCKET] Socket error:', error);
      console.error('❌ [SOCKET] Error message:', error.message);
      if (error.stack) {
        console.error('❌ [SOCKET] Error stack:', error.stack);
      }
    });

    // Handle parsing errors
    socket.on('disconnect', (reason) => {
      if (reason === 'transport close' || reason === 'transport error') {
        console.warn(`⚠️ [SOCKET] User ${userId} disconnected due to transport issue: ${reason}`);
      }
    });

    // Add data validation for incoming events
    const originalOnevent = socket.onevent;
    socket.onevent = function (packet) {
      const args = packet.data || [];
      const eventName = args[0];
      const eventData = args[1];

      // Validate incoming data
      if (eventData && typeof eventData === 'object') {
        try {
          JSON.stringify(eventData); // Test serialization
        } catch (e) {
          console.error(`❌ [SOCKET] Invalid payload received for event "${eventName}":`, e.message);
          socket.emit('error', { message: 'Invalid payload format', event: eventName });
          return;
        }
      }

      originalOnevent.call(this, packet);
    };
  });
};

// Helper function to sanitize data for Socket.IO
const sanitizeData = (data, seen = new WeakSet(), depth = 0) => {
  // Prevent infinite recursion and very deep objects
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (data === null || data === undefined) {
    return null;
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return data;
  }

  // Check for circular references
  if (seen.has(data)) {
    return '[CIRCULAR_REFERENCE]';
  }
  seen.add(data);

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, seen, depth + 1));
  }

  // Handle Mongoose documents - convert to plain object
  if (data.toObject && typeof data.toObject === 'function') {
    try {
      data = data.toObject({ virtuals: false, getters: false });
    } catch (e) {
      console.warn('⚠️ [SOCKET] Warning: Could not convert Mongoose document to object:', e.message);
      return '[MONGOOSE_DOCUMENT_ERROR]';
    }
  }

  // Handle Buffers - convert to base64
  if (Buffer.isBuffer(data)) {
    return data.toString('base64');
  }

  // Handle plain objects
  const sanitized = {};

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      try {
        const value = data[key];
        
        // Skip functions
        if (typeof value === 'function') {
          continue;
        }

        // Handle _id - always convert to string
        if (key === '_id') {
          sanitized[key] = value && value.toString ? value.toString() : value;
          continue;
        }

        // Skip __v (Mongoose version key) and other internal properties
        if (key === '__v' || key.startsWith('$')) {
          continue;
        }

        // Recursively sanitize nested objects
        sanitized[key] = sanitizeData(value, seen, depth + 1);
      } catch (e) {
        console.warn(`⚠️ [SOCKET] Warning: Could not serialize key "${key}":`, e.message);
        sanitized[key] = '[SERIALIZATION_ERROR]';
      }
    }
  }

  return sanitized;
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
  if (!io) {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot emit ${event} to user ${userId}`);
    return;
  }

  try {
    // Sanitize data before emitting
    const sanitizedData = sanitizeData(data);
    
    // Validate JSON serializability
    let testString;
    try {
      testString = JSON.stringify(sanitizedData);
      // Check payload size (Socket.IO has limits)
      if (testString.length > 1000000) { // 1MB limit
        console.error(`❌ [SOCKET] Payload too large (${testString.length} bytes) for event ${event}`);
        console.error(`❌ [SOCKET] Consider splitting the data or reducing payload size`);
        return;
      }
    } catch (e) {
      console.error(`❌ [SOCKET] Data is not JSON serializable for event ${event}:`, e.message);
      console.error(`❌ [SOCKET] Original data keys:`, Object.keys(data || {}));
      return;
    }

    console.log(`📤 [SOCKET] Emitting ${event} to user ${userId}`);
    console.log(`📤 [SOCKET] Data size: ${testString.length} bytes`);
    
    // Log data preview (truncated for large payloads)
    if (testString.length < 500) {
      console.log(`📤 [SOCKET] Data:`, testString);
    } else {
      console.log(`📤 [SOCKET] Data preview:`, testString.substring(0, 500) + '...');
    }

    io.to(`user_${userId}`).emit(event, sanitizedData);
    console.log(`✅ [SOCKET] Successfully emitted ${event} to user ${userId}`);
  } catch (error) {
    console.error(`❌ [SOCKET] Error emitting ${event} to user ${userId}:`, error.message);
    console.error(`❌ [SOCKET] Error stack:`, error.stack);
  }
};

// Emit to specific room
const emitToRoom = (room, event, data) => {
  if (!io) {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot emit ${event} to room ${room}`);
    return;
  }

  try {
    // Sanitize data before emitting
    const sanitizedData = sanitizeData(data);
    
    // Validate JSON serializability
    let testString;
    try {
      testString = JSON.stringify(sanitizedData);
      // Check payload size (Socket.IO has limits)
      if (testString.length > 1000000) { // 1MB limit
        console.error(`❌ [SOCKET] Payload too large (${testString.length} bytes) for event ${event}`);
        console.error(`❌ [SOCKET] Consider splitting the data or reducing payload size`);
        return;
      }
    } catch (e) {
      console.error(`❌ [SOCKET] Data is not JSON serializable for event ${event}:`, e.message);
      console.error(`❌ [SOCKET] Original data keys:`, Object.keys(data || {}));
      return;
    }

    console.log(`📤 [SOCKET] Emitting ${event} to room ${room}`);
    console.log(`📤 [SOCKET] Data size: ${testString.length} bytes`);
    
    // Log data preview (truncated for large payloads)
    if (testString.length < 500) {
      console.log(`📤 [SOCKET] Data:`, testString);
    } else {
      console.log(`📤 [SOCKET] Data preview:`, testString.substring(0, 500) + '...');
    }

    io.to(room).emit(event, sanitizedData);
    console.log(`✅ [SOCKET] Successfully emitted ${event} to room ${room}`);
  } catch (error) {
    console.error(`❌ [SOCKET] Error emitting ${event} to room ${room}:`, error.message);
    console.error(`❌ [SOCKET] Error stack:`, error.stack);
  }
};

// Emit to all users in an apartment
const broadcastToApartment = (apartmentCode, event, data) => {
  if (!io) {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot broadcast ${event} to apartment ${apartmentCode}`);
    return;
  }

  try {
    // Sanitize data before emitting
    const sanitizedData = sanitizeData(data);
    
    // Validate JSON serializability
    let testString;
    try {
      testString = JSON.stringify(sanitizedData);
      // Check payload size (Socket.IO has limits)
      if (testString.length > 1000000) { // 1MB limit
        console.error(`❌ [SOCKET] Payload too large (${testString.length} bytes) for event ${event}`);
        console.error(`❌ [SOCKET] Consider splitting the data or reducing payload size`);
        return;
      }
    } catch (e) {
      console.error(`❌ [SOCKET] Data is not JSON serializable for event ${event}:`, e.message);
      console.error(`❌ [SOCKET] Original data keys:`, Object.keys(data || {}));
      return;
    }

    console.log(`📤 [SOCKET] Broadcasting ${event} to apartment ${apartmentCode}`);
    console.log(`📤 [SOCKET] Data size: ${testString.length} bytes`);
    
    // Log data preview (truncated for large payloads)
    if (testString.length < 500) {
      console.log(`📤 [SOCKET] Data:`, testString);
    } else {
      console.log(`📤 [SOCKET] Data preview:`, testString.substring(0, 500) + '...');
    }

    io.to(`apartment_${apartmentCode}`).emit(event, sanitizedData);
    console.log(`✅ [SOCKET] Successfully broadcasted ${event} to apartment ${apartmentCode}`);
  } catch (error) {
    console.error(`❌ [SOCKET] Error broadcasting ${event} to apartment ${apartmentCode}:`, error.message);
    console.error(`❌ [SOCKET] Error stack:`, error.stack);
  }
};

// Emit to all connected clients
const broadcastToAll = (event, data) => {
  if (!io) {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot broadcast ${event} to all clients`);
    return;
  }

  try {
    // Sanitize data before emitting
    const sanitizedData = sanitizeData(data);
    
    // Validate JSON serializability
    let testString;
    try {
      testString = JSON.stringify(sanitizedData);
      // Check payload size (Socket.IO has limits)
      if (testString.length > 1000000) { // 1MB limit
        console.error(`❌ [SOCKET] Payload too large (${testString.length} bytes) for event ${event}`);
        console.error(`❌ [SOCKET] Consider splitting the data or reducing payload size`);
        return;
      }
    } catch (e) {
      console.error(`❌ [SOCKET] Data is not JSON serializable for event ${event}:`, e.message);
      return;
    }

    console.log(`📤 [SOCKET] Broadcasting ${event} to all clients`);
    console.log(`📤 [SOCKET] Data size: ${testString.length} bytes`);
    
    io.emit(event, sanitizedData);
    console.log(`✅ [SOCKET] Successfully broadcasted ${event} to all clients`);
  } catch (error) {
    console.error(`❌ [SOCKET] Error broadcasting ${event} to all clients:`, error.message);
    console.error(`❌ [SOCKET] Error stack:`, error.stack);
  }
};

// Get online users count
const getOnlineUsersCount = () => {
  if (io) {
    return io.engine.clientsCount;
  }
  return 0;
};

// Emit socket event (helper function for controllers)
const emitSocketEvent = (event, data) => {
  if (data.apartmentCode) {
    broadcastToApartment(data.apartmentCode, event, data);
  } else {
    broadcastToAll(event, data);
  }
};

module.exports = {
  initializeSocket,
  emitToUser,
  emitToRoom,
  broadcastToApartment,
  broadcastToAll,
  getOnlineUsersCount,
  emitSocketEvent
};