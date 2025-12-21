let io;
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');

// Track typing users per chat
const typingUsers = new Map(); // chatId -> Set of userIds

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

    // Chat-specific events
    socket.on('typing_start', async (data) => {
      const { chatId } = data;
      if (!chatId) return;

      // Add user to typing set
      if (!typingUsers.has(chatId)) {
        typingUsers.set(chatId, new Set());
      }
      typingUsers.get(chatId).add(userId);

      // Get chat to determine recipients
      const chat = await ChatRoom.findById(chatId);
      if (!chat) return;

      if (chat.type === 'personal') {
        // Emit to other participant
        chat.participants.forEach((p) => {
          if (p.user.toString() !== userId) {
            emitToUser(p.user.toString(), 'typing_start', {
              chatId,
              userId,
              userName: socket.user.fullName
            });
          }
        });
      } else if (chat.apartmentCode) {
        // Emit to apartment room
        emitToRoom(`apartment_${chat.apartmentCode}`, 'typing_start', {
          chatId,
          userId,
          userName: socket.user.fullName
        });
      }
    });

    socket.on('typing_stop', async (data) => {
      const { chatId } = data;
      if (!chatId) return;

      // Remove user from typing set
      if (typingUsers.has(chatId)) {
        typingUsers.get(chatId).delete(userId);
        if (typingUsers.get(chatId).size === 0) {
          typingUsers.delete(chatId);
        }
      }

      // Get chat to determine recipients
      const chat = await ChatRoom.findById(chatId);
      if (!chat) return;

      if (chat.type === 'personal') {
        chat.participants.forEach((p) => {
          if (p.user.toString() !== userId) {
            emitToUser(p.user.toString(), 'typing_stop', {
              chatId,
              userId
            });
          }
        });
      } else if (chat.apartmentCode) {
        emitToRoom(`apartment_${chat.apartmentCode}`, 'typing_stop', {
          chatId,
          userId
        });
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

      // Clean up typing indicators
      typingUsers.forEach((userSet, chatId) => {
        if (userSet.has(userId)) {
          userSet.delete(userId);
          if (userSet.size === 0) {
            typingUsers.delete(chatId);
          }
        }
      });
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

// Get online users for a chat
const getOnlineUsersForChat = async (chatId) => {
  if (!io) return [];
  
  const chat = await ChatRoom.findById(chatId);
  if (!chat) return [];

  if (chat.type === 'personal') {
    const userIds = chat.participants.map(p => p.user.toString());
    const users = await User.find({ _id: { $in: userIds }, isOnline: true })
      .select('_id fullName isOnline lastSeen')
      .lean();
    return users;
  } else if (chat.apartmentCode) {
    const users = await User.find({ 
      apartmentCode: chat.apartmentCode, 
      isOnline: true 
    })
      .select('_id fullName isOnline lastSeen')
      .lean();
    return users;
  }
  
  return [];
};

module.exports = {
  initializeSocket,
  emitToUser,
  emitToRoom,
  broadcastToApartment,
  broadcastToAll,
  getOnlineUsersCount,
  getOnlineUsersForChat
};