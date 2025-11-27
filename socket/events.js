const Complaint = require('../models/Complaint');
const Notice = require('../models/Notice');
const User = require('../models/User');
const { emitToUser, emitToRoom, broadcastToApartment } = require('../services/socketService');

// Complaint events
const complaintEvents = {
  // User creates a new complaint
  COMPLAINT_CREATED: 'complaint_created',
  
  // Complaint status updated
  COMPLAINT_STATUS_UPDATED: 'complaint_status_updated',
  
  // Complaint assigned to staff
  COMPLAINT_ASSIGNED: 'complaint_assigned',
  
  // Work update added to complaint
  WORK_UPDATE_ADDED: 'work_update_added',
  
  // Complaint rated by user
  COMPLAINT_RATED: 'complaint_rated',
  
  // Staff started working on complaint
  COMPLAINT_IN_PROGRESS: 'complaint_in_progress',
  
  // Complaint resolved
  COMPLAINT_RESOLVED: 'complaint_resolved'
};

// Notice events
const noticeEvents = {
  // New notice published
  NOTICE_PUBLISHED: 'notice_published',
  
  // Notice read by user
  NOTICE_READ: 'notice_read',
  
  // Urgent notice
  URGENT_NOTICE: 'urgent_notice'
};

// User events
const userEvents = {
  // User registered and pending approval
  USER_REGISTERED: 'user_registered',
  
  // User approved by admin
  USER_APPROVED: 'user_approved',
  
  // User rejected by admin
  USER_REJECTED: 'user_rejected',
  
  // User profile updated
  USER_PROFILE_UPDATED: 'user_profile_updated',
  
  // User logged in
  USER_LOGGED_IN: 'user_logged_in',
  
  // User logged out
  USER_LOGGED_OUT: 'user_logged_out'
};

// Admin events
const adminEvents = {
  // New registration pending approval
  NEW_REGISTRATION: 'new_registration',
  
  // New complaint created
  NEW_COMPLAINT: 'new_complaint',
  
  // Complaint status changed
  COMPLAINT_STATUS_CHANGED: 'complaint_status_changed',
  
  // Staff availability updated
  STAFF_AVAILABILITY_UPDATED: 'staff_availability_updated',
  
  // User approval updated
  USER_APPROVAL_UPDATED: 'user_approval_updated'
};

// Staff events
const staffEvents = {
  // New complaint assigned
  NEW_COMPLAINT_ASSIGNED: 'new_complaint_assigned',
  
  // Complaint rating received
  COMPLAINT_RATED: 'complaint_rated',
  
  // Availability updated
  AVAILABILITY_UPDATED: 'availability_updated'
};

// Notification events
const notificationEvents = {
  // General notification
  NOTIFICATION: 'notification',
  
  // Apartment-wide notification
  APARTMENT_NOTIFICATION: 'apartment_notification',
  
  // Urgent notification
  URGENT_NOTIFICATION: 'urgent_notification'
};

// Real-time update events
const realtimeEvents = {
  // Dashboard data updated
  DASHBOARD_UPDATED: 'dashboard_updated',
  
  // Stats updated
  STATS_UPDATED: 'stats_updated',
  
  // Online users updated
  ONLINE_USERS_UPDATED: 'online_users_updated'
};

// Combined events object
const SOCKET_EVENTS = {
  ...complaintEvents,
  ...noticeEvents,
  ...userEvents,
  ...adminEvents,
  ...staffEvents,
  ...notificationEvents,
  ...realtimeEvents
};

// Event handlers mapping
const EVENT_HANDLERS = {
  [complaintEvents.COMPLAINT_CREATED]: handleComplaintCreated,
  [complaintEvents.COMPLAINT_STATUS_UPDATED]: handleComplaintStatusUpdated,
  [noticeEvents.NOTICE_PUBLISHED]: handleNoticePublished,
  [userEvents.USER_APPROVED]: handleUserApproved,
  [adminEvents.NEW_REGISTRATION]: handleNewRegistration
};

// Event handler functions
async function handleComplaintCreated(socket, data) {
  try {
    const complaint = await Complaint.findById(data.complaintId)
      .populate('createdBy', 'fullName wing flatNumber');
    
    if (!complaint) return;

    // Notify admins in the same apartment
    const admins = await User.find({ 
      role: 'admin', 
      apartmentCode: complaint.createdBy.apartmentCode,
      status: 'active'
    });

    admins.forEach(admin => {
      emitToUser(admin._id.toString(), adminEvents.NEW_COMPLAINT, {
        complaint: {
          id: complaint._id,
          ticketNumber: complaint.ticketNumber,
          title: complaint.title,
          category: complaint.category,
          priority: complaint.priority,
          createdBy: complaint.createdBy.fullName,
          createdAt: complaint.createdAt
        }
      });
    });

    // Log the event
    await AuditLog.create({
      action: 'COMPLAINT_CREATED',
      description: `New complaint created: ${complaint.ticketNumber}`,
      performedBy: socket.user._id,
      targetEntity: 'Complaint',
      targetId: complaint._id,
      metadata: {
        ticketNumber: complaint.ticketNumber,
        category: complaint.category,
        priority: complaint.priority
      }
    });

  } catch (error) {
    console.error('Handle complaint created error:', error);
  }
}

async function handleComplaintStatusUpdated(socket, data) {
  try {
    const { complaintId, oldStatus, newStatus } = data;
    
    const complaint = await Complaint.findById(complaintId)
      .populate('createdBy', 'fullName phoneNumber')
      .populate('assignedTo.staff', 'user');

    if (!complaint) return;

    // Notify the complaint creator
    emitToUser(complaint.createdBy._id.toString(), complaintEvents.COMPLAINT_STATUS_UPDATED, {
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
        oldStatus,
        newStatus
      },
      timestamp: new Date()
    });

    // Notify assigned staff if any
    if (complaint.assignedTo && complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff) {
        emitToUser(staff.user._id.toString(), complaintEvents.COMPLAINT_STATUS_UPDATED, {
          complaint: {
            id: complaint._id,
            ticketNumber: complaint.ticketNumber,
            title: complaint.title,
            oldStatus,
            newStatus
          },
          timestamp: new Date()
        });
      }
    }

    // Notify admins
    emitToRoom('admin', adminEvents.COMPLAINT_STATUS_CHANGED, {
      complaintId: complaint._id,
      ticketNumber: complaint.ticketNumber,
      oldStatus,
      newStatus,
      updatedBy: socket.user._id
    });

  } catch (error) {
    console.error('Handle complaint status updated error:', error);
  }
}

async function handleNoticePublished(socket, data) {
  try {
    const { noticeId } = data;
    
    const notice = await Notice.findById(noticeId).populate('createdBy', 'fullName');
    if (!notice) return;

    // Get the apartment code from the admin who created the notice
    const admin = await User.findById(notice.createdBy._id);
    if (!admin) return;

    // Broadcast to entire apartment
    broadcastToApartment(admin.apartmentCode, noticeEvents.NOTICE_PUBLISHED, {
      notice: {
        id: notice._id,
        title: notice.title,
        category: notice.category,
        priority: notice.priority,
        createdBy: notice.createdBy.fullName,
        publishAt: notice.schedule.publishAt,
        requiresAcknowledgement: notice.requiresAcknowledgement
      }
    });

    // If it's an urgent notice, send additional notifications
    if (notice.priority === 'Urgent') {
      broadcastToApartment(admin.apartmentCode, noticeEvents.URGENT_NOTICE, {
        notice: {
          id: notice._id,
          title: notice.title,
          category: notice.category
        }
      });
    }

  } catch (error) {
    console.error('Handle notice published error:', error);
  }
}

async function handleUserApproved(socket, data) {
  try {
    const { userId } = data;
    
    const user = await User.findById(userId);
    if (!user) return;

    // Notify the user about approval
    emitToUser(userId, userEvents.USER_APPROVED, {
      message: 'Your account has been approved by admin',
      timestamp: new Date(),
      user: {
        id: user._id,
        fullName: user.fullName,
        status: user.status
      }
    });

    // Send welcome notification
    emitToUser(userId, notificationEvents.NOTIFICATION, {
      type: 'WELCOME',
      title: 'Welcome to ApartmentSync!',
      message: 'Your account has been activated. You can now access all features.',
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Handle user approved error:', error);
  }
}

async function handleNewRegistration(socket, data) {
  try {
    const { user } = data;
    
    // Notify all admins in the same apartment
    const admins = await User.find({ 
      role: 'admin', 
      apartmentCode: user.apartmentCode,
      status: 'active'
    });

    admins.forEach(admin => {
      emitToUser(admin._id.toString(), adminEvents.NEW_REGISTRATION, {
        message: 'New user registration pending approval',
        user: {
          id: user.id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          apartmentCode: user.apartmentCode,
          wing: user.wing,
          flatNumber: user.flatNumber,
          registeredAt: new Date()
        }
      });
    });

  } catch (error) {
    console.error('Handle new registration error:', error);
  }
}

module.exports = {
  SOCKET_EVENTS,
  EVENT_HANDLERS,
  complaintEvents,
  noticeEvents,
  userEvents,
  adminEvents,
  staffEvents,
  notificationEvents,
  realtimeEvents
};