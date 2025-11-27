let io;

const initializeSocket = (socketIO) => {
  io = socketIO;
  
  // Socket middleware for authentication
  const { socketAuth } = require('../middleware/auth');
  io.use(socketAuth);

  // Socket connection handling
  io.on('connection', (socket) => {
    console.log(`✅ User ${socket.user._id} connected`);

    // Join user to their personal room
    socket.join(`user_${socket.user._id}`);

    // Join user to role-based rooms
    socket.join(socket.user.role);

    // Join user to apartment room
    socket.join(`apartment_${socket.user.apartmentCode}`);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ User ${socket.user._id} disconnected`);
    });

    // Handle custom events
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`User ${socket.user._id} joined room: ${room}`);
    });

    socket.on('leave_room', (room) => {
      socket.leave(room);
      console.log(`User ${socket.user._id} left room: ${room}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
    console.log(`📤 Emitted ${event} to user ${userId}`);
  }
};

// Emit to specific room
const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
    console.log(`📤 Emitted ${event} to room ${room}`);
  }
};

// Emit to all users in an apartment
const broadcastToApartment = (apartmentCode, event, data) => {
  if (io) {
    io.to(`apartment_${apartmentCode}`).emit(event, data);
    console.log(`📤 Broadcasted ${event} to apartment ${apartmentCode}`);
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