const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Staff = require('../models/Staff');
const { emitToUser, emitToRoom } = require('../services/socketService');

// @desc    Create new complaint
// @route   POST /api/complaints
// @access  Private (Resident)
const createComplaint = async (req, res) => {
  try {
    const userId = req.user.id;
    const complaintData = req.body;

    // Get user details for location
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has too many active complaints
    const activeComplaintsCount = await Complaint.countDocuments({
      createdBy: userId,
      status: { $in: ['Open', 'Assigned', 'In Progress'] }
    });

    if (activeComplaintsCount >= 5) {
      return res.status(400).json({
        success: false,
        message: 'You have reached the maximum limit of 5 active complaints'
      });
    }

    // Create complaint with user location
    const complaint = await Complaint.create({
      ...complaintData,
      createdBy: userId,
      location: {
        ...complaintData.location,
        wing: user.wing,
        flatNumber: user.flatNumber,
        floorNumber: user.floorNumber
      }
    });

    // Populate createdBy for response
    await complaint.populate('createdBy', 'fullName phoneNumber wing flatNumber');

    // Notify admins about new complaint
    const admins = await User.find({ role: 'admin', status: 'active' });
    admins.forEach(admin => {
      emitToUser(admin._id.toString(), 'new_complaint', {
        message: 'New complaint submitted',
        complaint: {
          id: complaint._id,
          ticketNumber: complaint.ticketNumber,
          title: complaint.title,
          category: complaint.category,
          priority: complaint.priority,
          createdBy: complaint.createdBy.fullName
        }
      });
    });

    // Broadcast to admin room
    emitToRoom('admin', 'complaint_created', {
      complaint: complaint
    });

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: { complaint }
    });

  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating complaint',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      .populate('createdBy', 'fullName phoneNumber')
      .populate('assignedTo.staff', 'user')
      .populate({
        path: 'assignedTo.staff',
        populate: { path: 'user', select: 'fullName phoneNumber profilePicture' }
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
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get my complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaints'
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

    if (userRole === 'resident') {
      // Residents can only see their own complaints
      complaint = await Complaint.findOne({
        _id: complaintId,
        createdBy: userId
      });
    } else if (userRole === 'staff') {
      // Staff can see assigned complaints
      const staff = await Staff.findOne({ user: userId });
      complaint = await Complaint.findOne({
        _id: complaintId,
        $or: [
          { createdBy: userId },
          { 'assignedTo.staff': staff?._id }
        ]
      });
    } else if (userRole === 'admin') {
      // Admins can see all complaints
      complaint = await Complaint.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Populate necessary fields
    await complaint.populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture');
    await complaint.populate('assignedTo.staff', 'user specialization');
    await complaint.populate({
      path: 'assignedTo.staff',
      populate: { path: 'user', select: 'fullName phoneNumber profilePicture' }
    });
    await complaint.populate('timeline.updatedBy', 'fullName role');
    await complaint.populate('workUpdates.updatedBy', 'fullName role');

    res.status(200).json({
      success: true,
      data: { complaint }
    });

  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint'
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
        message: 'Staff profile not found'
      });
    }

    // Check if complaint is assigned to this staff
    const complaint = await Complaint.findOne({
      _id: complaintId,
      'assignedTo.staff': staff._id
    });

    if (!complaint) {
      return res.status(403).json({
        success: false,
        message: 'Complaint not assigned to you'
      });
    }

    // Add work update
    complaint.workUpdates.push({
      description,
      images: images || [],
      updatedBy: staffId
    });

    await complaint.save();

    // Populate for response
    await complaint.populate('workUpdates.updatedBy', 'fullName role profilePicture');

    // Notify user about work update
    emitToUser(complaint.createdBy.toString(), 'work_update_added', {
      message: 'Work update added to your complaint',
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title
      },
      update: complaint.workUpdates[complaint.workUpdates.length - 1]
    });

    // Notify admins
    emitToRoom('admin', 'complaint_updated', {
      complaintId: complaint._id,
      updateType: 'work_update',
      update: complaint.workUpdates[complaint.workUpdates.length - 1]
    });

    res.status(200).json({
      success: true,
      message: 'Work update added successfully',
      data: { complaint }
    });

  } catch (error) {
    console.error('Add work update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding work update'
    });
  }
};

// @desc    Update complaint status (Staff/Admin)
// @route   PUT /api/complaints/:id/status
// @access  Private (Staff, Admin)
const updateComplaintStatus = async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = req.user.id;
    const { status, description } = req.body;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check permissions
    if (req.user.role === 'staff') {
      const staff = await Staff.findOne({ user: userId });
      if (!staff || complaint.assignedTo.staff.toString() !== staff._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this complaint'
        });
      }
    }

    // Update status with timeline
    await complaint.updateStatus(status, description, userId);

    // Populate for response
    await complaint.populate('createdBy', 'fullName phoneNumber');
    await complaint.populate('assignedTo.staff', 'user');
    await complaint.populate({
      path: 'assignedTo.staff',
      populate: { path: 'user', select: 'fullName phoneNumber' }
    });

    // Notify user about status change
    emitToUser(complaint.createdBy.toString(), 'complaint_status_updated', {
      message: `Complaint status updated to ${status}`,
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
        status: complaint.status
      }
    });

    // Notify admins
    emitToRoom('admin', 'complaint_status_changed', {
      complaintId: complaint._id,
      newStatus: status,
      updatedBy: userId
    });

    res.status(200).json({
      success: true,
      message: 'Complaint status updated successfully',
      data: { complaint }
    });

  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating complaint status'
    });
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
      status: 'Resolved'
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found or not eligible for rating'
      });
    }

    // Update rating
    complaint.rating = {
      score,
      comment,
      ratedAt: new Date()
    };

    await complaint.save();

    // Update staff performance if assigned
    if (complaint.assignedTo.staff) {
      await updateStaffPerformance(complaint.assignedTo.staff);
    }

    // Notify staff about rating
    if (complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff) {
        emitToUser(staff.user._id.toString(), 'complaint_rated', {
          message: 'Your work has been rated',
          complaint: {
            id: complaint._id,
            ticketNumber: complaint.ticketNumber,
            title: complaint.title
          },
          rating: { score, comment }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Complaint rated successfully',
      data: { complaint }
    });

  } catch (error) {
    console.error('Rate complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rating complaint'
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
        'assignedTo.staff': staffId,
        'rating.score': { $exists: true }
      }
    },
    {
      $group: {
        _id: null,
        totalComplaints: { $sum: 1 },
        averageRating: { $avg: '$rating.score' },
        averageResolutionTime: {
          $avg: {
            $divide: [
              { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        },
        slaCompliant: {
          $avg: {
            $cond: [
              { $eq: ['$sla.isBreached', false] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  if (stats.length > 0) {
    staff.performance = {
      totalComplaints: stats[0].totalComplaints,
      resolvedComplaints: stats[0].totalComplaints,
      averageRating: Math.round(stats[0].averageRating * 10) / 10,
      averageResolutionTime: Math.round(stats[0].averageResolutionTime * 10) / 10,
      slaCompliance: Math.round(stats[0].slaCompliant * 100)
    };

    await staff.save();
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaint,
  addWorkUpdate,
  updateComplaintStatus,
  rateComplaint
};