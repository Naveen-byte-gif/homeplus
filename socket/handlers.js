const Complaint = require('../models/Complaint');
const Notice = require('../models/Notice');
const User = require('../models/User');
const Staff = require('../models/Staff');
const { SOCKET_EVENTS, EVENT_HANDLERS } = require('./events');
const { emitToUser, emitToRoom, broadcastToApartment } = require('../services/socketService');
const { logAuditEvent } = require('../services/realtimeUpdateService');

// Initialize socket handlers
const initializeSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ User ${socket.user._id} (${socket.user.role}) connected from apartment ${socket.user.apartmentCode}`);

    // User joins their personal room
    socket.join(`user_${socket.user._id}`);
    
    // User joins role-based room
    socket.join(socket.user.role);
    
    // User joins apartment room
    socket.join(`apartment_${socket.user.apartmentCode}`);

    // Notify about user connection
    handleUserConnected(socket);

    // Register event listeners
    registerEventListeners(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      handleUserDisconnected(socket);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.user._id}:`, error);
    });

    // Custom event: Join specific room
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`User ${socket.user._id} joined room: ${room}`);
    });

    // Custom event: Leave specific room
    socket.on('leave_room', (room) => {
      socket.leave(room);
      console.log(`User ${socket.user._id} left room: ${room}`);
    });

    // Custom event: Request dashboard update
    socket.on('request_dashboard_update', async () => {
      await handleDashboardUpdateRequest(socket);
    });

    // Custom event: Mark notice as read
    socket.on('mark_notice_read', async (data) => {
      await handleMarkNoticeRead(socket, data);
    });

    // Custom event: Update staff availability
    socket.on('update_availability', async (data) => {
      await handleUpdateAvailability(socket, data);
    });

    // Custom event: Send message to admin
    socket.on('message_admin', async (data) => {
      await handleMessageAdmin(socket, data);
    });
  });
};

// Handle user connection
const handleUserConnected = async (socket) => {
  try {
    // Update user's last active timestamp
    await User.findByIdAndUpdate(socket.user._id, {
      lastActive: new Date()
    });

    // Notify admins about user online status
    if (socket.user.role === 'resident') {
      const admins = await User.find({ 
        role: 'admin', 
        apartmentCode: socket.user.apartmentCode 
      });
      
      admins.forEach(admin => {
        emitToUser(admin._id.toString(), SOCKET_EVENTS.USER_LOGGED_IN, {
          user: {
            id: socket.user._id,
            fullName: socket.user.fullName,
            wing: socket.user.wing,
            flatNumber: socket.user.flatNumber
          },
          timestamp: new Date()
        });
      });
    }

    // Send welcome message with current stats
    const dashboardData = await getInitialDashboardData(socket.user);
    socket.emit(SOCKET_EVENTS.DASHBOARD_UPDATED, dashboardData);

    // Log connection
    await logAuditEvent({
      action: 'USER_CONNECTED',
      description: `User ${socket.user.fullName} connected`,
      performedBy: socket.user._id,
      targetEntity: 'User',
      targetId: socket.user._id,
      metadata: {
        role: socket.user.role,
        apartmentCode: socket.user.apartmentCode
      }
    });

  } catch (error) {
    console.error('Handle user connected error:', error);
  }
};

// Handle user disconnection
const handleUserDisconnected = async (socket) => {
  try {
    console.log(`❌ User ${socket.user._id} disconnected`);

    // Update user's last active timestamp
    await User.findByIdAndUpdate(socket.user._id, {
      lastActive: new Date()
    });

    // Notify admins about user offline status
    if (socket.user.role === 'resident') {
      const admins = await User.find({ 
        role: 'admin', 
        apartmentCode: socket.user.apartmentCode 
      });
      
      admins.forEach(admin => {
        emitToUser(admin._id.toString(), SOCKET_EVENTS.USER_LOGGED_OUT, {
          user: {
            id: socket.user._id,
            fullName: socket.user.fullName
          },
          timestamp: new Date()
        });
      });
    }

    // Log disconnection
    await logAuditEvent({
      action: 'USER_DISCONNECTED',
      description: `User ${socket.user.fullName} disconnected`,
      performedBy: socket.user._id,
      targetEntity: 'User',
      targetId: socket.user._id
    });

  } catch (error) {
    console.error('Handle user disconnected error:', error);
  }
};

// Register event listeners for the socket
const registerEventListeners = (socket) => {
  // Listen for all registered events and route to appropriate handlers
  Object.keys(EVENT_HANDLERS).forEach(eventName => {
    socket.on(eventName, async (data) => {
      try {
        await EVENT_HANDLERS[eventName](socket, data);
      } catch (error) {
        console.error(`Error handling event ${eventName}:`, error);
        socket.emit('error', {
          event: eventName,
          message: 'Error processing event',
          error: error.message
        });
      }
    });
  });
};

// Handle dashboard update request
const handleDashboardUpdateRequest = async (socket) => {
  try {
    const dashboardData = await getInitialDashboardData(socket.user);
    socket.emit(SOCKET_EVENTS.DASHBOARD_UPDATED, dashboardData);
  } catch (error) {
    console.error('Handle dashboard update request error:', error);
    socket.emit('error', {
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
};

// Handle mark notice as read
const handleMarkNoticeRead = async (socket, data) => {
  try {
    const { noticeId } = data;
    
    const notice = await Notice.findById(noticeId);
    if (!notice) {
      socket.emit('error', { message: 'Notice not found' });
      return;
    }

    await notice.markAsRead(socket.user._id);

    // Notify that notice was read
    emitToUser(socket.user._id.toString(), SOCKET_EVENTS.NOTICE_READ, {
      noticeId: notice._id,
      readAt: new Date()
    });

  } catch (error) {
    console.error('Handle mark notice read error:', error);
    socket.emit('error', {
      message: 'Error marking notice as read',
      error: error.message
    });
  }
};

// Handle update staff availability
const handleUpdateAvailability = async (socket, data) => {
  try {
    if (socket.user.role !== 'staff') {
      socket.emit('error', { message: 'Only staff can update availability' });
      return;
    }

    const { availability, status } = data;
    
    const staff = await Staff.findOne({ user: socket.user._id });
    if (!staff) {
      socket.emit('error', { message: 'Staff profile not found' });
      return;
    }

    if (availability) staff.availability.schedule = availability;
    if (status) staff.availability.currentStatus = status;

    await staff.save();

    // Notify admins about availability change
    const admins = await User.find({ 
      role: 'admin', 
      apartmentCode: socket.user.apartmentCode 
    });

    admins.forEach(admin => {
      emitToUser(admin._id.toString(), SOCKET_EVENTS.STAFF_AVAILABILITY_UPDATED, {
        staff: {
          id: staff._id,
          name: socket.user.fullName
        },
        availability: staff.availability,
        timestamp: new Date()
      });
    });

    socket.emit(SOCKET_EVENTS.AVAILABILITY_UPDATED, {
      message: 'Availability updated successfully',
      availability: staff.availability
    });

  } catch (error) {
    console.error('Handle update availability error:', error);
    socket.emit('error', {
      message: 'Error updating availability',
      error: error.message
    });
  }
};

// Handle message to admin
const handleMessageAdmin = async (socket, data) => {
  try {
    const { message, category } = data;
    
    const admins = await User.find({ 
      role: 'admin', 
      apartmentCode: socket.user.apartmentCode 
    });

    admins.forEach(admin => {
      emitToUser(admin._id.toString(), SOCKET_EVENTS.NOTIFICATION, {
        type: 'USER_MESSAGE',
        title: `Message from ${socket.user.fullName}`,
        message: message,
        category: category,
        fromUser: {
          id: socket.user._id,
          fullName: socket.user.fullName,
          wing: socket.user.wing,
          flatNumber: socket.user.flatNumber
        },
        timestamp: new Date()
      });
    });

    socket.emit('message_sent', {
      message: 'Message sent to admin successfully'
    });

  } catch (error) {
    console.error('Handle message admin error:', error);
    socket.emit('error', {
      message: 'Error sending message to admin',
      error: error.message
    });
  }
};

// Get initial dashboard data based on user role
const getInitialDashboardData = async (user) => {
  switch (user.role) {
    case 'resident':
      return await getResidentDashboardData(user);
    case 'staff':
      return await getStaffDashboardData(user);
    case 'admin':
      return await getAdminDashboardData(user);
    default:
      return {};
  }
};

// Get resident dashboard data
const getResidentDashboardData = async (user) => {
  const activeComplaints = await Complaint.countDocuments({
    createdBy: user._id,
    status: { $in: ['Open', 'Assigned', 'In Progress'] }
  });

  const recentNotices = await Notice.find({
    status: 'Published',
    'schedule.publishAt': { $lte: new Date() },
    $or: [
      { 'schedule.expireAt': { $gt: new Date() } },
      { 'schedule.expireAt': { $exists: false } }
    ]
  })
  .sort({ 'schedule.publishAt': -1 })
  .limit(5)
  .select('title category priority schedule.publishAt');

  return {
    activeComplaints,
    recentNotices,
    lastUpdated: new Date()
  };
};

// Get staff dashboard data
const getStaffDashboardData = async (user) => {
  const staff = await Staff.findOne({ user: user._id });
  if (!staff) return {};

  const assignedComplaints = await Complaint.countDocuments({
    'assignedTo.staff': staff._id,
    status: { $in: ['Assigned', 'In Progress'] }
  });

  return {
    assignedComplaints,
    currentWorkload: staff.currentWorkload,
    availability: staff.availability,
    lastUpdated: new Date()
  };
};

// Get admin dashboard data
const getAdminDashboardData = async (user) => {
  const pendingApprovals = await User.countDocuments({
    apartmentCode: user.apartmentCode,
    status: 'pending',
    role: 'resident'
  });

  const activeComplaints = await Complaint.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $match: {
        'user.apartmentCode': user.apartmentCode,
        status: { $in: ['Open', 'Assigned', 'In Progress'] }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    pendingApprovals,
    activeComplaints,
    lastUpdated: new Date()
  };
};

module.exports = {
  initializeSocketHandlers,
  handleUserConnected,
  handleUserDisconnected,
  registerEventListeners
};