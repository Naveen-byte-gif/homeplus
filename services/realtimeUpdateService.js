const Complaint = require('../models/Complaint');
const Notice = require('../models/Notice');
const User = require('../models/User');
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const { emitToUser, emitToRoom, broadcastToApartment, getOnlineUsersCount } = require('./socketService');
const { SOCKET_EVENTS } = require('../socket/events');

// Real-time complaint updates
class RealTimeUpdateService {
  constructor() {
    this.onlineUsers = new Map();
    this.userSockets = new Map();
  }

  // Initialize real-time service
  initialize(io) {
    this.io = io;
    this.setupEventListeners();
  }

  // Setup event listeners for real-time updates
  setupEventListeners() {
    // Complaint status change listener
    Complaint.watch().on('change', (change) => {
      if (change.operationType === 'update') {
        this.handleComplaintUpdate(change);
      }
    });

    // Notice publication listener
    Notice.watch().on('change', (change) => {
      if (change.operationType === 'insert') {
        this.handleNewNotice(change.fullDocument);
      }
    });

    // User status change listener
    User.watch().on('change', (change) => {
      if (change.operationType === 'update') {
        this.handleUserUpdate(change);
      }
    });
  }

  // Handle complaint updates in real-time
  async handleComplaintUpdate(change) {
    try {
      const complaintId = change.documentKey._id;
      const updatedFields = change.updateDescription.updatedFields;

      // Get the full complaint document
      const complaint = await Complaint.findById(complaintId)
        .populate('createdBy', 'fullName phoneNumber')
        .populate('assignedTo.staff', 'user');

      if (!complaint) return;

      // Handle status changes
      if (updatedFields.status) {
        await this.broadcastComplaintStatusChange(complaint, updatedFields.status);
      }

      // Handle assignment changes
      if (updatedFields.assignedTo) {
        await this.broadcastComplaintAssignment(complaint);
      }

      // Handle work updates
      if (updatedFields.workUpdates) {
        await this.broadcastWorkUpdate(complaint);
      }

      // Handle resolution
      if (updatedFields.resolution) {
        await this.broadcastComplaintResolution(complaint);
      }

      // Update dashboard for relevant users
      await this.updateComplaintDashboards(complaint);

    } catch (error) {
      console.error('Handle complaint update error:', error);
    }
  }

  // Broadcast complaint status change
  async broadcastComplaintStatusChange(complaint, newStatus) {
    const oldStatus = complaint.status;

    // Notify complaint creator
    emitToUser(complaint.createdBy._id.toString(), SOCKET_EVENTS.COMPLAINT_STATUS_UPDATED, {
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
        emitToUser(staff.user._id.toString(), SOCKET_EVENTS.COMPLAINT_STATUS_UPDATED, {
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
    emitToRoom('admin', SOCKET_EVENTS.COMPLAINT_STATUS_CHANGED, {
      complaintId: complaint._id,
      ticketNumber: complaint.ticketNumber,
      oldStatus,
      newStatus,
      timestamp: new Date()
    });

    // Log the status change
    await this.logAuditEvent({
      action: 'COMPLAINT_STATUS_CHANGED',
      description: `Complaint ${complaint.ticketNumber} status changed from ${oldStatus} to ${newStatus}`,
      targetEntity: 'Complaint',
      targetId: complaint._id,
      metadata: {
        ticketNumber: complaint.ticketNumber,
        oldStatus,
        newStatus
      }
    });
  }

  // Broadcast complaint assignment
  async broadcastComplaintAssignment(complaint) {
    if (!complaint.assignedTo || !complaint.assignedTo.staff) return;

    const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
    if (!staff) return;

    // Notify assigned staff
    emitToUser(staff.user._id.toString(), SOCKET_EVENTS.NEW_COMPLAINT_ASSIGNED, {
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority,
        location: complaint.location
      },
      assignedAt: complaint.assignedTo.assignedAt
    });

    // Notify complaint creator
    emitToUser(complaint.createdBy._id.toString(), SOCKET_EVENTS.COMPLAINT_ASSIGNED, {
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title
      },
      staff: {
        name: staff.user.fullName,
        phone: staff.user.phoneNumber
      },
      assignedAt: complaint.assignedTo.assignedAt
    });

    // Update staff dashboard
    this.updateStaffDashboard(staff.user._id);
  }

  // Broadcast work update
  async broadcastWorkUpdate(complaint) {
    if (!complaint.workUpdates || complaint.workUpdates.length === 0) return;

    const latestUpdate = complaint.workUpdates[complaint.workUpdates.length - 1];

    // Notify complaint creator
    emitToUser(complaint.createdBy._id.toString(), SOCKET_EVENTS.WORK_UPDATE_ADDED, {
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title
      },
      update: latestUpdate,
      timestamp: new Date()
    });

    // Notify admins
    emitToRoom('admin', SOCKET_EVENTS.WORK_UPDATE_ADDED, {
      complaintId: complaint._id,
      ticketNumber: complaint.ticketNumber,
      update: latestUpdate,
      timestamp: new Date()
    });
  }

  // Broadcast complaint resolution
  async broadcastComplaintResolution(complaint) {
    if (complaint.status !== 'Resolved') return;

    // Notify complaint creator
    emitToUser(complaint.createdBy._id.toString(), SOCKET_EVENTS.COMPLAINT_RESOLVED, {
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title
      },
      resolution: complaint.resolution,
      timestamp: new Date()
    });

    // Notify assigned staff if any
    if (complaint.assignedTo && complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff) {
        emitToUser(staff.user._id.toString(), SOCKET_EVENTS.COMPLAINT_RESOLVED, {
          complaint: {
            id: complaint._id,
            ticketNumber: complaint.ticketNumber,
            title: complaint.title
          },
          resolution: complaint.resolution,
          timestamp: new Date()
        });
      }
    }
  }

  // Handle new notice publication
  async handleNewNotice(notice) {
    try {
      if (notice.status !== 'Published') return;

      const admin = await User.findById(notice.createdBy);
      if (!admin) return;

      // Broadcast to entire apartment
      broadcastToApartment(admin.apartmentCode, SOCKET_EVENTS.NOTICE_PUBLISHED, {
        notice: {
          id: notice._id,
          title: notice.title,
          category: notice.category,
          priority: notice.priority,
          createdBy: admin.fullName,
          publishAt: notice.schedule.publishAt,
          requiresAcknowledgement: notice.requiresAcknowledgement
        }
      });

      // If urgent notice, send additional notification
      if (notice.priority === 'Urgent') {
        broadcastToApartment(admin.apartmentCode, SOCKET_EVENTS.URGENT_NOTICE, {
          notice: {
            id: notice._id,
            title: notice.title,
            category: notice.category
          }
        });
      }

    } catch (error) {
      console.error('Handle new notice error:', error);
    }
  }

  // Handle user updates
  async handleUserUpdate(change) {
    try {
      const userId = change.documentKey._id;
      const updatedFields = change.updateDescription.updatedFields;

      const user = await User.findById(userId);
      if (!user) return;

      // Handle user approval
      if (updatedFields.status === 'active' && user.role === 'resident') {
        emitToUser(userId, SOCKET_EVENTS.USER_APPROVED, {
          message: 'Your account has been approved by admin',
          timestamp: new Date()
        });
      }

      // Handle user suspension
      if (updatedFields.status === 'suspended') {
        emitToUser(userId, SOCKET_EVENTS.NOTIFICATION, {
          type: 'ACCOUNT_SUSPENDED',
          title: 'Account Suspended',
          message: 'Your account has been suspended. Please contact admin.',
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Handle user update error:', error);
    }
  }

  // Update complaint dashboards for relevant users
  async updateComplaintDashboards(complaint) {
    // Update creator's dashboard
    this.updateUserDashboard(complaint.createdBy._id);

    // Update assigned staff's dashboard if any
    if (complaint.assignedTo && complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff) {
        this.updateStaffDashboard(staff.user._id);
      }
    }

    // Update admin dashboards in the same apartment
    const admins = await User.find({
      role: 'admin',
      apartmentCode: complaint.createdBy.apartmentCode
    });

    admins.forEach(admin => {
      this.updateAdminDashboard(admin._id);
    });
  }

  // Update user dashboard
  async updateUserDashboard(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      const activeComplaints = await Complaint.countDocuments({
        createdBy: userId,
        status: { $in: ['Open', 'Assigned', 'In Progress'] }
      });

      const recentComplaints = await Complaint.find({
        createdBy: userId
      })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('ticketNumber title status updatedAt');

      emitToUser(userId.toString(), SOCKET_EVENTS.DASHBOARD_UPDATED, {
        activeComplaints,
        recentComplaints,
        lastUpdated: new Date()
      });

    } catch (error) {
      console.error('Update user dashboard error:', error);
    }
  }

  // Update staff dashboard
  async updateStaffDashboard(userId) {
    try {
      const staff = await Staff.findOne({ user: userId }).populate('user');
      if (!staff) return;

      const assignedComplaints = await Complaint.countDocuments({
        'assignedTo.staff': staff._id,
        status: { $in: ['Assigned', 'In Progress'] }
      });

      const recentCompleted = await Complaint.find({
        'assignedTo.staff': staff._id,
        status: { $in: ['Resolved', 'Closed'] }
      })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('ticketNumber title rating');

      emitToUser(userId.toString(), SOCKET_EVENTS.DASHBOARD_UPDATED, {
        assignedComplaints,
        recentCompleted,
        currentWorkload: staff.currentWorkload,
        lastUpdated: new Date()
      });

    } catch (error) {
      console.error('Update staff dashboard error:', error);
    }
  }

  // Update admin dashboard
  async updateAdminDashboard(userId) {
    try {
      const admin = await User.findById(userId);
      if (!admin) return;

      const pendingApprovals = await User.countDocuments({
        apartmentCode: admin.apartmentCode,
        status: 'pending',
        role: 'resident'
      });

      const complaintStats = await Complaint.aggregate([
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
            'user.apartmentCode': admin.apartmentCode
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = complaintStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      emitToUser(userId.toString(), SOCKET_EVENTS.DASHBOARD_UPDATED, {
        pendingApprovals,
        complaintStats: stats,
        lastUpdated: new Date()
      });

    } catch (error) {
      console.error('Update admin dashboard error:', error);
    }
  }

  // Track online users
  trackUserConnection(userId, socketId) {
    this.onlineUsers.set(userId, {
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    this.userSockets.set(socketId, userId);

    // Broadcast online users update to admins
    this.broadcastOnlineUsersUpdate();
  }

  // Track user disconnection
  trackUserDisconnection(socketId) {
    const userId = this.userSockets.get(socketId);
    
    if (userId) {
      this.onlineUsers.delete(userId);
      this.userSockets.delete(socketId);
      
      // Broadcast online users update to admins
      this.broadcastOnlineUsersUpdate();
    }
  }

  // Broadcast online users count to admins
  broadcastOnlineUsersUpdate() {
    const onlineCount = this.onlineUsers.size;
    
    emitToRoom('admin', SOCKET_EVENTS.ONLINE_USERS_UPDATED, {
      onlineCount,
      timestamp: new Date()
    });
  }

  // Log audit event
  async logAuditEvent(auditData) {
    try {
      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Log audit event error:', error);
    }
  }

  // Get real-time stats
  async getRealTimeStats(apartmentCode) {
    try {
      const [
        totalUsers,
        activeComplaints,
        pendingApprovals,
        onlineUsers
      ] = await Promise.all([
        User.countDocuments({ apartmentCode, status: 'active' }),
        Complaint.countDocuments({ 
          'createdBy.apartmentCode': apartmentCode,
          status: { $in: ['Open', 'Assigned', 'In Progress'] }
        }),
        User.countDocuments({ apartmentCode, status: 'pending' }),
        this.onlineUsers.size
      ]);

      return {
        totalUsers,
        activeComplaints,
        pendingApprovals,
        onlineUsers,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Get real-time stats error:', error);
      return {};
    }
  }
}

// Create singleton instance
const realTimeUpdateService = new RealTimeUpdateService();

module.exports = {
  realTimeUpdateService,
  RealTimeUpdateService,
  logAuditEvent: realTimeUpdateService.logAuditEvent.bind(realTimeUpdateService)
};