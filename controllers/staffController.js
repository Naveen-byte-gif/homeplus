const Staff = require('../models/Staff');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const { emitToUser, emitToRoom } = require('../services/socketService');

// @desc    Get staff dashboard
// @route   GET /api/staff/dashboard
// @access  Private (Staff)
const getStaffDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get staff profile
    const staff = await Staff.findOne({ user: userId })
      .populate('user', 'fullName phoneNumber profilePicture');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Get assigned complaints
    const assignedComplaints = await Complaint.find({
      'assignedTo.staff': staff._id,
      status: { $in: ['Assigned', 'In Progress'] }
    })
    .populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture')
    .sort({ priority: -1, createdAt: 1 })
    .limit(10);

    // Get recent completed complaints
    const recentCompleted = await Complaint.find({
      'assignedTo.staff': staff._id,
      status: { $in: ['Resolved', 'Closed'] }
    })
    .populate('createdBy', 'fullName wing flatNumber')
    .sort({ updatedAt: -1 })
    .limit(5);

    // Get performance stats
    const performanceStats = await Complaint.aggregate([
      {
        $match: {
          'assignedTo.staff': staff._id,
          status: { $in: ['Resolved', 'Closed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          averageRating: { $avg: '$rating.score' },
          averageResolutionTime: {
            $avg: {
              $divide: [
                { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
                1000 * 60 * 60 // Convert to hours
              ]
            }
          }
        }
      }
    ]);

    const stats = performanceStats[0] || {
      totalCompleted: 0,
      averageRating: 0,
      averageResolutionTime: 0
    };

    res.status(200).json({
      success: true,
      data: {
        staff,
        dashboard: {
          activeAssignments: assignedComplaints.length,
          totalCompleted: stats.totalCompleted,
          averageRating: Math.round(stats.averageRating * 10) / 10 || 0,
          averageResolutionTime: Math.round(stats.averageResolutionTime * 10) / 10 || 0,
          currentWorkload: staff.currentWorkload
        },
        assignedComplaints,
        recentCompleted
      }
    });

  } catch (error) {
    console.error('Get staff dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching staff dashboard'
    });
  }
};

// @desc    Get staff's assigned complaints
// @route   GET /api/staff/assigned-complaints
// @access  Private (Staff)
const getAssignedComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    // Get staff profile
    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Build filter
    const filter = { 'assignedTo.staff': staff._id };
    if (status) filter.status = status;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture')
      .sort({ priority: -1, createdAt: 1 })
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
    console.error('Get assigned complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned complaints'
    });
  }
};

// @desc    Update staff availability
// @route   PUT /api/staff/availability
// @access  Private (Staff)
const updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const { schedule, currentStatus, nextAvailable } = req.body;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Update availability
    if (schedule) staff.availability.schedule = schedule;
    if (currentStatus) staff.availability.currentStatus = currentStatus;
    if (nextAvailable) staff.availability.nextAvailable = nextAvailable;

    await staff.save();

    // Notify admins about availability change
    emitToRoom('admin', 'staff_availability_updated', {
      staffId: staff._id,
      currentStatus: staff.availability.currentStatus,
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: { availability: staff.availability }
    });

  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating availability'
    });
  }
};

// @desc    Update staff specialization
// @route   PUT /api/staff/specialization
// @access  Private (Staff)
const updateSpecialization = async (req, res) => {
  try {
    const userId = req.user.id;
    const { specialization } = req.body;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    staff.specialization = specialization;
    await staff.save();

    res.status(200).json({
      success: true,
      message: 'Specialization updated successfully',
      data: { specialization: staff.specialization }
    });

  } catch (error) {
    console.error('Update specialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating specialization'
    });
  }
};

module.exports = {
  getStaffDashboard,
  getAssignedComplaints,
  updateAvailability,
  updateSpecialization
};