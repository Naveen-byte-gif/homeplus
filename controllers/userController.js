const User = require('../models/User');
const Complaint = require('../models/Complaint');
const { emitToUser } = require('../services/socketService');

// @desc    Get user dashboard data
// @route   GET /api/users/dashboard
// @access  Private
const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's active complaints
    const activeComplaints = await Complaint.find({
      createdBy: userId,
      status: { $in: ['Open', 'Assigned', 'In Progress'] }
    })
    .select('ticketNumber title category priority status createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

    // Get recent resolved complaints
    const recentComplaints = await Complaint.find({
      createdBy: userId,
      status: { $in: ['Resolved', 'Closed'] }
    })
    .select('ticketNumber title category status resolvedAt rating')
    .sort({ updatedAt: -1 })
    .limit(5);

    // Get complaint statistics
    const complaintStats = await Complaint.aggregate([
      { $match: { createdBy: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Transform stats to object
    const stats = complaintStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        dashboard: {
          activeComplaints: activeComplaints.length,
          totalComplaints: Object.values(stats).reduce((a, b) => a + b, 0),
          resolvedComplaints: stats.Resolved || 0 + stats.Closed || 0,
          recentActivity: recentComplaints
        },
        activeComplaints,
        stats
      }
    });

  } catch (error) {
    console.error('Get user dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    // Fields that can be updated by user
    const allowedUpdates = ['fullName', 'email', 'profilePicture', 'notificationPreferences'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Emit profile update event
    emitToUser(userId, 'profile_updated', {
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profilePicture: user.profilePicture
      }
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
};

// @desc    Change password
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Emit password change event
    emitToUser(userId, 'password_changed', {
      message: 'Password changed successfully',
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
};

module.exports = {
  getUserDashboard,
  updateProfile,
  changePassword
};