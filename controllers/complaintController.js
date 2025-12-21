const Complaint = require("../models/Complaint");
const User = require("../models/User");
const Staff = require("../models/Staff");
const { emitToUser, emitToRoom } = require("../services/socketService");
const {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusUpdate,
  notifyCommentAdded,
  notifyWorkUpdate,
  notifyTicketResolved,
  notifyTicketClosed,
  notifyTicketReopened,
  notifyTicketCancelled,
} = require("../services/ticketNotificationService");

// @desc    Create new complaint
// @route   POST /api/complaints
// @access  Private (Resident ONLY)
const createComplaint = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const complaintData = req.body;

    // STRICT: Only residents can create complaints
    if (userRole !== "resident") {
      return res.status(403).json({
        success: false,
        message: "Only residents can create complaints",
        errorCode: 'FORBIDDEN_CREATE',
      });
    }

    // Get user details for location
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ENFORCE: Complaints can only be created with status "Open"
    // Override any status in request body
    if (complaintData.status && complaintData.status !== "Open") {
      return res.status(400).json({
        success: false,
        message: "Complaints must be created with status 'Open' only. Status will be set automatically.",
        errorCode: 'INVALID_INITIAL_STATUS',
      });
    }

    // Check if user has too many active complaints
    const activeComplaintsCount = await Complaint.countDocuments({
      createdBy: userId,
      status: { $in: ["Open", "Assigned", "In Progress"] },
    });

    if (activeComplaintsCount >= 5) {
      return res.status(400).json({
        success: false,
        message: "You have reached the maximum limit of 5 active complaints",
      });
    }

    // Create complaint with user location
    // Status is always "Open" for new complaints (enforced)
    const complaint = await Complaint.create({
      ...complaintData,
      status: "Open", // Always "Open" - enforced regardless of input
      createdBy: userId,
      location: {
        ...complaintData.location,
        wing: user.wing || complaintData.location?.wing,
        flatNumber: user.flatNumber || complaintData.location?.flatNumber,
        floorNumber: user.floorNumber || complaintData.location?.floorNumber,
      },
    });

    // Populate createdBy for response
    await complaint.populate(
      "createdBy",
      "fullName phoneNumber wing flatNumber email notificationPreferences fcmToken"
    );

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyTicketCreated(complaint);

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Create complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating complaint",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Get user's complaints
// @route   GET /api/complaints/my-complaints
// @access  Private (Resident)
const getMyComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, category } = req.query;

    // Build filter
    const filter = { createdBy: userId };
    if (status) filter.status = status;
    if (category) filter.category = category;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate("createdBy", "fullName phoneNumber")
      .populate("assignedTo.staff", "user")
      .populate({
        path: "assignedTo.staff",
        populate: {
          path: "user",
          select: "fullName phoneNumber profilePicture",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        complaints,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get my complaints error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching complaints",
    });
  }
};

// @desc    Get complaint by ID
// @route   GET /api/complaints/:id
// @access  Private
const getComplaint = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    let complaint;

    if (userRole === "resident") {
      // Residents can only see their own complaints
      complaint = await Complaint.findOne({
        _id: complaintId,
        createdBy: userId,
      });
    } else if (userRole === "staff") {
      // Staff can see assigned complaints
      const staff = await Staff.findOne({ user: userId });
      complaint = await Complaint.findOne({
        _id: complaintId,
        $or: [{ createdBy: userId }, { "assignedTo.staff": staff?._id }],
      });
    } else if (userRole === "admin") {
      // Admins can see all complaints
      complaint = await Complaint.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Populate necessary fields
    await complaint.populate(
      "createdBy",
      "fullName phoneNumber wing flatNumber profilePicture"
    );
    await complaint.populate("assignedTo.staff", "user specialization");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName phoneNumber profilePicture" },
    });
    await complaint.populate("assignedTo.assignedBy", "fullName role");
    await complaint.populate("timeline.updatedBy", "fullName role");
    await complaint.populate("workUpdates.updatedBy", "fullName role");
    await complaint.populate("comments.postedBy", "fullName role profilePicture");
    await complaint.populate("reopenedBy", "fullName role");
    await complaint.populate("cancelledBy", "fullName role");

    res.status(200).json({
      success: true,
      data: { complaint },
    });
  } catch (error) {
    console.error("Get complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching complaint",
    });
  }
};

// @desc    Add work update to complaint (Staff)
// @route   POST /api/complaints/:id/work-updates
// @access  Private (Staff)
const addWorkUpdate = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const staffId = req.user.id;
    const { description, images } = req.body;

    // Get staff record
    const staff = await Staff.findOne({ user: staffId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    // Check if complaint is assigned to this staff
    const complaint = await Complaint.findOne({
      _id: complaintId,
      "assignedTo.staff": staff._id,
    });

    if (!complaint) {
      return res.status(403).json({
        success: false,
        message: "Complaint not assigned to you",
      });
    }

    // Add work update
    complaint.workUpdates.push({
      description,
      images: images || [],
      updatedBy: staffId,
    });

    await complaint.save();

    // Populate for response
    await complaint.populate(
      "workUpdates.updatedBy",
      "fullName role profilePicture"
    );
    await complaint.populate("createdBy", "fullName email notificationPreferences fcmToken");

    const workUpdate = complaint.workUpdates[complaint.workUpdates.length - 1];

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyWorkUpdate(complaint, workUpdate, staffId);

    res.status(200).json({
      success: true,
      message: "Work update added successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Add work update error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding work update",
    });
  }
};

// @desc    Update complaint status (Staff/Admin/Resident with role-based validation)
// @route   PUT /api/complaints/:id/status
// @access  Private
const updateComplaintStatus = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status, description, reason } = req.body;

    // Get client IP and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
        errorCode: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Check if resident owns this complaint
    const isOwnComplaint = complaint.createdBy.toString() === userId;

    // Import validation service
    const {
      validateStatusTransition,
    } = require('../services/statusTransitionService');

    // Validate status transition with role-based rules
    const validation = validateStatusTransition(
      complaint.status,
      status,
      userRole,
      {
        complaint,
        userId,
        isOwnComplaint,
        hasComment: !!(description || reason),
      }
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        errorCode: validation.errorCode,
      });
    }

    // Only admin can update status - route is already protected by authorize("admin")
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can update complaint status",
        errorCode: 'FORBIDDEN_STATUS_UPDATE',
      });
    }

    // Get old status before update
    const oldStatus = complaint.status;
    const commentText = description || reason || `Status changed from ${oldStatus} to ${status}`;

    // Update status with timeline and audit history
    await complaint.updateStatus(status, commentText, userId, {
      updatedByRole: userRole,
      ipAddress,
      userAgent,
      metadata: {
        previousStatus: oldStatus,
      },
    });

    // Update SLA timers based on status change
    await updateSLATimers(complaint, oldStatus, status);

    // Populate for response and notifications
    await complaint.populate("createdBy", "fullName phoneNumber email apartmentCode wing flatNumber floorNumber notificationPreferences fcmToken");
    await complaint.populate("assignedTo.staff", "user");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName phoneNumber email notificationPreferences fcmToken" },
    });

    // Get admin user info for notification
    const adminUser = await User.findById(userId).select("fullName role");

    // Send comprehensive notifications (Push + Email + Socket) with residence location
    await notifyStatusUpdate(complaint, oldStatus, status, userId, {
      updatedByName: adminUser?.fullName || 'Admin',
      updatedAt: new Date().toISOString(),
    });

    // Special handling for resolved status
    if (status === "Resolved") {
      await notifyTicketResolved(complaint, userId);
    }

    res.status(200).json({
      success: true,
      message: "Complaint status updated successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Update complaint status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating complaint status",
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

// Helper function to update SLA timers
const updateSLATimers = async (complaint, oldStatus, newStatus) => {
  try {
    // When status changes to In Progress, record start time
    if (newStatus === "In Progress" && oldStatus !== "In Progress") {
      if (!complaint.sla) complaint.sla = {};
      if (!complaint.sla.actualResolution) {
        complaint.sla.inProgressAt = new Date();
        // Update expected resolution if not set
        if (!complaint.sla.expectedResolution) {
          const slaHours = {
            Emergency: 2,
            High: 24,
            Medium: 72,
            Low: 168,
          };
          complaint.sla.expectedResolution = new Date(
            Date.now() + (slaHours[complaint.priority] || 72) * 60 * 60 * 1000
          );
        }
      }
    }

    // When status changes to Resolved, record actual resolution time
    if (newStatus === "Resolved") {
      if (!complaint.sla) complaint.sla = {};
      complaint.sla.actualResolution = new Date();
      complaint.sla.isBreached =
        complaint.sla.actualResolution > (complaint.sla.expectedResolution || new Date());
      
      // Calculate resolution time
      const createdAt = complaint.createdAt || new Date();
      const resolutionTime = complaint.sla.actualResolution - createdAt;
      complaint.sla.resolutionTimeHours = Math.round((resolutionTime / (1000 * 60 * 60)) * 10) / 10;
    }

    await complaint.save();
  } catch (error) {
    console.error("Error updating SLA timers:", error);
    // Don't fail the request if SLA update fails
  }
};

// @desc    Rate complaint (Resident)
// @route   POST /api/complaints/:id/rate
// @access  Private (Resident)
const rateComplaint = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const { score, comment } = req.body;

    const complaint = await Complaint.findOne({
      _id: complaintId,
      createdBy: userId,
      status: "Resolved",
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found or not eligible for rating",
      });
    }

    // Update rating
    complaint.rating = {
      score,
      comment,
      ratedAt: new Date(),
    };

    await complaint.save();

    // Update staff performance if assigned
    if (complaint.assignedTo.staff) {
      await updateStaffPerformance(complaint.assignedTo.staff);
    }

    // Notify staff about rating
    if (complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate(
        "user"
      );
      if (staff) {
        emitToUser(staff.user._id.toString(), "complaint_rated", {
          message: "Your work has been rated",
          complaint: {
            id: complaint._id,
            ticketNumber: complaint.ticketNumber,
            title: complaint.title,
          },
          rating: { score, comment },
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Complaint rated successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Rate complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Error rating complaint",
    });
  }
};

// Helper function to update staff performance
const updateStaffPerformance = async (staffId) => {
  const staff = await Staff.findById(staffId);
  if (!staff) return;

  // Calculate new performance metrics
  const stats = await Complaint.aggregate([
    {
      $match: {
        "assignedTo.staff": staffId,
        "rating.score": { $exists: true },
      },
    },
    {
      $group: {
        _id: null,
        totalComplaints: { $sum: 1 },
        averageRating: { $avg: "$rating.score" },
        averageResolutionTime: {
          $avg: {
            $divide: [
              { $subtract: ["$resolution.resolvedAt", "$createdAt"] },
              1000 * 60 * 60, // Convert to hours
            ],
          },
        },
        slaCompliant: {
          $avg: {
            $cond: [{ $eq: ["$sla.isBreached", false] }, 1, 0],
          },
        },
      },
    },
  ]);

  if (stats.length > 0) {
    staff.performance = {
      totalComplaints: stats[0].totalComplaints,
      resolvedComplaints: stats[0].totalComplaints,
      averageRating: Math.round(stats[0].averageRating * 10) / 10,
      averageResolutionTime:
        Math.round(stats[0].averageResolutionTime * 10) / 10,
      slaCompliance: Math.round(stats[0].slaCompliant * 100),
    };

    await staff.save();
  }
};

// @desc    Assign complaint to staff (Admin/Owner/Manager)
// @route   POST /api/complaints/:id/assign
// @access  Private (Admin)
const assignTicket = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const { staffId, note } = req.body;

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can assign tickets",
      });
    }

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (complaint.status === "Cancelled" || complaint.status === "Closed") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign a cancelled or closed ticket",
      });
    }

    // Get staff record
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    // Check if staff is available
    if (!staff.isAvailable()) {
      return res.status(400).json({
        success: false,
        message: "Staff member is not available",
      });
    }

    // Assign ticket
    complaint.assignedTo = {
      staff: staffId,
      assignedAt: new Date(),
      assignedBy: userId,
    };

    // Update status to Assigned if it was Open
    if (complaint.status === "Open" || complaint.status === "Reopened") {
      await complaint.updateStatus(
        "Assigned",
        note || `Ticket assigned to ${staff.user.fullName || "staff"}`,
        userId
      );
    } else {
      await complaint.save();
    }

    // Update staff workload
    staff.currentWorkload.activeComplaints += 1;
    await staff.save();

    // Populate for response
    await complaint.populate("assignedTo.staff", "user specialization");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName phoneNumber profilePicture email notificationPreferences fcmToken" },
    });
    await complaint.populate("assignedTo.assignedBy", "fullName role");
    await complaint.populate("createdBy", "fullName email notificationPreferences fcmToken");

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyTicketAssigned(complaint, staffId, userId);

    res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Assign ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning ticket",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Add comment to ticket
// @route   POST /api/complaints/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const { text, media } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment text is required",
      });
    }

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check permissions - residents can only comment on their own tickets
    if (req.user.role === "resident") {
      if (complaint.createdBy.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: "You can only comment on your own tickets",
        });
      }
    }

    // Add comment
    const comment = await complaint.addComment(text, userId, media || []);

    // Populate comment for response
    await complaint.populate("comments.postedBy", "fullName role profilePicture");
    await complaint.populate("createdBy", "fullName email notificationPreferences fcmToken");

    const newComment = complaint.comments[complaint.comments.length - 1];

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyCommentAdded(complaint, newComment, userId);

    res.status(200).json({
      success: true,
      message: "Comment added successfully",
      data: { comment: newComment, complaint },
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding comment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Reopen ticket (Resident/Admin)
// @route   POST /api/complaints/:id/reopen
// @access  Private
const reopenTicket = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { reason } = req.body;

    // Get client IP and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
        errorCode: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Check if resident owns this complaint
    const isOwnComplaint = complaint.createdBy.toString() === userId;

    // Validate reason is provided (mandatory for reopening)
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Reopen reason is required",
        errorCode: 'REASON_REQUIRED',
      });
    }

    // Import validation service
    const {
      validateStatusTransition,
    } = require('../services/statusTransitionService');

    // Validate status transition
    const validation = validateStatusTransition(
      complaint.status,
      "Reopened",
      userRole,
      {
        complaint,
        userId,
        isOwnComplaint,
        hasComment: !!(reason && reason.trim().length > 0),
      }
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        errorCode: validation.errorCode,
      });
    }

    // Reopen ticket with audit trail
    await complaint.updateStatus(
      "Reopened",
      reason,
      userId,
      {
        updatedByRole: userRole,
        ipAddress,
        userAgent,
        metadata: {
          reopenReason: reason,
          previousStatus: complaint.status,
        },
      }
    );

    // Populate for response
    await complaint.populate("createdBy", "fullName phoneNumber email notificationPreferences fcmToken");
    await complaint.populate("reopenedBy", "fullName role");
    await complaint.populate("assignedTo.staff", "user");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName email notificationPreferences fcmToken" },
    });

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyTicketReopened(complaint, userId, reason);

    res.status(200).json({
      success: true,
      message: "Ticket reopened successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Reopen ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Error reopening ticket",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Close ticket (Resident/Admin)
// @route   POST /api/complaints/:id/close
// @access  Private
const closeTicket = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { reason } = req.body;

    // Get client IP and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
        errorCode: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Check if resident owns this complaint
    const isOwnComplaint = complaint.createdBy.toString() === userId;

    // If admin is closing, reason is mandatory
    if (userRole === "admin" && (!reason || reason.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Reason is required when admin closes a ticket",
        errorCode: 'REASON_REQUIRED',
      });
    }

    // Import validation service
    const {
      validateStatusTransition,
    } = require('../services/statusTransitionService');

    // Validate status transition
    const validation = validateStatusTransition(
      complaint.status,
      "Closed",
      userRole,
      {
        complaint,
        userId,
        isOwnComplaint,
        hasComment: !!(reason || userRole === "resident"), // Residents don't need reason, admins do
      }
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        errorCode: validation.errorCode,
      });
    }

    // Close ticket with audit trail
    const closeReason = reason || "Ticket closed by resident - issue resolved";
    await complaint.updateStatus(
      "Closed",
      closeReason,
      userId,
      {
        updatedByRole: userRole,
        ipAddress,
        userAgent,
        metadata: {
          closeReason: closeReason,
        },
      }
    );

    // Update staff workload if assigned
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff);
      if (staff && staff.currentWorkload.activeComplaints > 0) {
        staff.currentWorkload.activeComplaints -= 1;
        await staff.save();
      }
    }

    // Populate for response
    await complaint.populate("createdBy", "fullName phoneNumber email notificationPreferences fcmToken");
    await complaint.populate("assignedTo.staff", "user");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName email notificationPreferences fcmToken" },
    });

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyTicketClosed(complaint, userId);

    res.status(200).json({
      success: true,
      message: "Ticket closed successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Close ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Error closing ticket",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Cancel ticket
// @route   POST /api/complaints/:id/cancel
// @access  Private
const cancelTicket = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { reason } = req.body;

    // Get client IP and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
        errorCode: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Validate cancellation reason is provided (mandatory for cancellation)
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
        errorCode: 'REASON_REQUIRED',
      });
    }

    // Check if resident owns this complaint
    const isOwnComplaint = complaint.createdBy.toString() === userId;

    // Import validation service
    const {
      validateStatusTransition,
    } = require('../services/statusTransitionService');

    // Validate status transition
    const validation = validateStatusTransition(
      complaint.status,
      "Cancelled",
      userRole,
      {
        complaint,
        userId,
        isOwnComplaint,
        hasComment: !!(reason && reason.trim().length > 0),
      }
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        errorCode: validation.errorCode,
      });
    }

    // Cancel ticket with audit trail
    complaint.cancellationReason = reason;
    await complaint.updateStatus(
      "Cancelled",
      reason,
      userId,
      {
        updatedByRole: userRole,
        ipAddress,
        userAgent,
        metadata: {
          cancellationReason: reason,
        },
      }
    );

    // Update staff workload if assigned
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff);
      if (staff && staff.currentWorkload.activeComplaints > 0) {
        staff.currentWorkload.activeComplaints -= 1;
        await staff.save();
      }
    }

    // Populate for response
    await complaint.populate("createdBy", "fullName phoneNumber email notificationPreferences fcmToken");
    await complaint.populate("cancelledBy", "fullName role");
    await complaint.populate("assignedTo.staff", "user");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName email notificationPreferences fcmToken" },
    });

    // Send comprehensive notifications (Push + Email + Socket)
    await notifyTicketCancelled(complaint, userId, reason);

    res.status(200).json({
      success: true,
      message: "Ticket cancelled successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Cancel ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling ticket",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Get all tickets (Admin/Staff)
// @route   GET /api/complaints/all
// @access  Private (Admin, Staff)
const getAllTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, priority, assignedTo } = req.query;
    const userRole = req.user.role;

    // Build filter
    const filter = {};

    if (userRole === "staff") {
      const staff = await Staff.findOne({ user: req.user.id });
      if (staff) {
        filter["assignedTo.staff"] = staff._id;
      } else {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found",
        });
      }
    }

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedTo) filter["assignedTo.staff"] = assignedTo;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate("createdBy", "fullName phoneNumber wing flatNumber profilePicture")
      .populate("assignedTo.staff", "user specialization")
      .populate({
        path: "assignedTo.staff",
        populate: { path: "user", select: "fullName phoneNumber profilePicture" },
      })
      .populate("assignedTo.assignedBy", "fullName role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        complaints,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all tickets error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching tickets",
    });
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaint,
  getAllTickets,
  addWorkUpdate,
  updateComplaintStatus,
  rateComplaint,
  assignTicket,
  addComment,
  reopenTicket,
  closeTicket,
  cancelTicket,
};
