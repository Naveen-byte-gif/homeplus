let io;

const initializeSocket = (socketIO) => {
  io = socketIO;
  
  // Socket middleware for authentication
  const { socketAuth } = require('../middleware/auth');
  io.use(socketAuth);

  // Socket connection handling
  io.on('connection', (socket) => {
    console.log(`✅ [SOCKET] User ${socket.user._id} connected`);
    console.log(`✅ [SOCKET] User role: ${socket.user.role}`);
    console.log(`✅ [SOCKET] User apartment: ${socket.user.apartmentCode}`);

    // Join user to their personal room
    socket.join(`user_${socket.user._id}`);
    console.log(`✅ [SOCKET] User ${socket.user._id} joined personal room: user_${socket.user._id}`);

    // Join user to role-based rooms
    socket.join(socket.user.role);
    console.log(`✅ [SOCKET] User ${socket.user._id} joined role room: ${socket.user.role}`);

    // Join user to apartment room (only if they have apartment code)
    if (socket.user.apartmentCode) {
      socket.join(`apartment_${socket.user.apartmentCode}`);
      console.log(`✅ [SOCKET] User ${socket.user._id} joined apartment room: apartment_${socket.user.apartmentCode}`);
    } else {
      console.log(`ℹ️ [SOCKET] User ${socket.user._id} has no apartment code (admin without apartment)`);
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ [SOCKET] User ${socket.user._id} disconnected`);
    });

    // Handle custom events
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`✅ [SOCKET] User ${socket.user._id} joined room: ${room}`);
    });

    socket.on('leave_room', (room) => {
      socket.leave(room);
      console.log(`✅ [SOCKET] User ${socket.user._id} left room: ${room}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('❌ [SOCKET] Socket error:', error);
      console.error('❌ [SOCKET] Error stack:', error.stack);
    });
  });
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    console.log(`📤 [SOCKET] Emitting ${event} to user ${userId}`);
    console.log(`📤 [SOCKET] Data:`, JSON.stringify(data, null, 2));
    io.to(`user_${userId}`).emit(event, data);
    console.log(`✅ [SOCKET] Successfully emitted ${event} to user ${userId}`);
  } else {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot emit ${event} to user ${userId}`);
  }
};

// Emit to specific room
const emitToRoom = (room, event, data) => {
  if (io) {
    console.log(`📤 [SOCKET] Emitting ${event} to room ${room}`);
    console.log(`📤 [SOCKET] Data:`, JSON.stringify(data, null, 2));
    io.to(room).emit(event, data);
    console.log(`✅ [SOCKET] Successfully emitted ${event} to room ${room}`);
  } else {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot emit ${event} to room ${room}`);
  }
};

// Emit to all users in an apartment
const broadcastToApartment = (apartmentCode, event, data) => {
  if (io) {
    console.log(`📤 [SOCKET] Broadcasting ${event} to apartment ${apartmentCode}`);
    console.log(`📤 [SOCKET] Data:`, JSON.stringify(data, null, 2));
    io.to(`apartment_${apartmentCode}`).emit(event, data);
    console.log(`✅ [SOCKET] Successfully broadcasted ${event} to apartment ${apartmentCode}`);
  } else {
    console.warn(`⚠️ [SOCKET] Socket.IO not initialized - cannot broadcast ${event} to apartment ${apartmentCode}`);
  }
};

// Emit to all connected clients
const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    console.log(`📤 Broadcasted ${event} to all clients`);
  }
};

// Get online users count
const getOnlineUsersCount = () => {
  if (io) {
    return io.engine.clientsCount;
  }
  return 0;
};

module.exports = {
  initializeSocket,
  emitToUser,
  emitToRoom,
  broadcastToApartment,
  broadcastToAll,
  getOnlineUsersCount
};