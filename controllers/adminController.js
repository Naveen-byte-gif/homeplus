const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Staff = require('../models/Staff');
const Notice = require('../models/Notice');
const Apartment = require('../models/Apartment');
const { emitToUser, emitToRoom } = require('../services/socketService');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
const getAdminDashboard = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const apartmentCode = admin.apartmentCode;

    // Get pending user approvals
    const pendingUsers = await User.countDocuments({
      apartmentCode,
      status: 'pending',
      role: 'resident'
    });

    // Get complaint statistics
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
          'user.apartmentCode': apartmentCode
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get staff performance
    const staffPerformance = await Staff.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $match: {
          'user.apartmentCode': apartmentCode,
          isActive: true
        }
      },
      {
        $project: {
          'user.fullName': 1,
          'user.profilePicture': 1,
          performance: 1,
          currentWorkload: 1,
          specialization: 1
        }
      }
    ]);

    // Get recent activities
    const recentComplaints = await Complaint.find()
      .populate({
        path: 'createdBy',
        match: { apartmentCode: apartmentCode },
        select: 'fullName wing flatNumber'
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .then(complaints => complaints.filter(comp => comp.createdBy)); // Filter by apartment

    // Transform complaint stats
    const stats = complaintStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        dashboard: {
          pendingApprovals: pendingUsers,
          totalComplaints: Object.values(stats).reduce((a, b) => a + b, 0),
          activeComplaints: stats.Open + stats.Assigned + stats['In Progress'] || 0,
          resolvedComplaints: stats.Resolved + stats.Closed || 0,
          staffPerformance,
          recentActivities: recentComplaints
        }
      }
    });

  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin dashboard'
    });
  }
};

// @desc    Get pending user approvals
// @route   GET /api/admin/pending-approvals
// @access  Private (Admin)
const getPendingApprovals = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const pendingUsers = await User.find({
      apartmentCode: admin.apartmentCode,
      status: 'pending',
      role: 'resident'
    }).select('-password');

    res.status(200).json({
      success: true,
      data: { pendingUsers }
    });

  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending approvals'
    });
  }
};

// @desc    Approve/Reject user
// @route   PUT /api/admin/users/:userId/approval
// @access  Private (Admin)
const updateUserApproval = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason } = req.body; // action: 'approve' or 'reject'
    const adminId = req.user.id;

    // Get user to be updated
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if admin has permission for this apartment
    const admin = await User.findById(adminId);
    if (user.apartmentCode !== admin.apartmentCode) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage users from this apartment'
      });
    }

    let updateData = {};
    let message = '';

    if (action === 'approve') {
      updateData = { status: 'active' };
      message = 'User approved successfully';
      
      // Notify user about approval
      emitToUser(userId, 'user_approved', {
        message: 'Your account has been approved by admin',
        timestamp: new Date()
      });

    } else if (action === 'reject') {
      updateData = { status: 'rejected' };
      message = 'User rejected successfully';
      
      // Notify user about rejection
      emitToUser(userId, 'user_rejected', {
        message: 'Your account registration has been rejected',
        reason: reason || 'No reason provided',
        timestamp: new Date()
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    // Broadcast to admin room
    emitToRoom('admin', 'user_approval_updated', {
      userId,
      action,
      updatedBy: adminId
    });

    res.status(200).json({
      success: true,
      message,
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Update user approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user approval'
    });
  }
};

// @desc    Get all complaints for admin
// @route   GET /api/admin/complaints
// @access  Private (Admin)
const getAllComplaints = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { page = 1, limit = 10, status, category, priority, wing } = req.query;

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Build filter
    const filter = {};
    
    // Filter by apartment through user lookup
    const userFilter = { apartmentCode: admin.apartmentCode };
    if (wing) userFilter.wing = wing;

    // Get users from the same apartment
    const apartmentUsers = await User.find(userFilter).select('_id');
    const userIds = apartmentUsers.map(user => user._id);

    filter.createdBy = { $in: userIds };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture')
      .populate('assignedTo.staff', 'user')
      .populate({
        path: 'assignedTo.staff',
        populate: { path: 'user', select: 'fullName phoneNumber' }
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
    console.error('Get all complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaints'
    });
  }
};

// @desc    Assign complaint to staff
// @route   PUT /api/admin/complaints/:complaintId/assign
// @access  Private (Admin)
const assignComplaintToStaff = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { staffId } = req.body;
    const adminId = req.user.id;

    // Get complaint
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Get staff
    const staff = await Staff.findById(staffId).populate('user');
    if (!staff || !staff.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found or inactive'
      });
    }

    // Check if staff is available
    if (!staff.isAvailable()) {
      return res.status(400).json({
        success: false,
        message: 'Staff is currently at full capacity'
      });
    }

    // Assign complaint
    complaint.assignedTo = {
      staff: staffId,
      assignedAt: new Date(),
      assignedBy: adminId
    };

    // Update status and timeline
    await complaint.updateStatus('Assigned', `Complaint assigned to ${staff.user.fullName}`, adminId);

    // Update staff workload
    staff.currentWorkload.activeComplaints += 1;
    await staff.save();

    // Populate for response
    await complaint.populate('assignedTo.staff', 'user');
    await complaint.populate({
      path: 'assignedTo.staff',
      populate: { path: 'user', select: 'fullName phoneNumber profilePicture' }
    });

    // Notify staff about assignment
    emitToUser(staff.user._id.toString(), 'complaint_assigned', {
      message: 'New complaint assigned to you',
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority,
        location: complaint.location
      }
    });

    // Notify user about assignment
    emitToUser(complaint.createdBy.toString(), 'complaint_assigned', {
      message: 'Your complaint has been assigned to staff',
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title
      },
      staff: {
        name: staff.user.fullName,
        phone: staff.user.phoneNumber
      }
    });

    res.status(200).json({
      success: true,
      message: 'Complaint assigned successfully',
      data: { complaint }
    });

  } catch (error) {
    console.error('Assign complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning complaint'
    });
  }
};

// @desc    Get all staff members
// @route   GET /api/admin/staff
// @access  Private (Admin)
const getAllStaff = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const staff = await Staff.find()
      .populate({
        path: 'user',
        match: { apartmentCode: admin.apartmentCode },
        select: 'fullName phoneNumber email profilePicture'
      })
      .then(staff => staff.filter(s => s.user)); // Filter by apartment

      res.status(200).json({
        success: true,
        data: { staff }
      });
  
    } catch (error) {
      console.error('Get all staff error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching staff members'
      });
    }
  };