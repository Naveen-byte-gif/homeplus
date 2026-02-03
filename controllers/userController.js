const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Apartment = require('../models/Apartment');
const Notice = require('../models/Notice');
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
    const allowedUpdates = ['fullName', 'email', 'profilePicture', 'emergencyContact', 'notificationPreferences'];
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

    // Send password changed email notification
    const emailService = require('../services/emailService');
    try {
      await emailService.sendPasswordChangedEmail(user);
      console.log(`✅ [PASSWORD CHANGE] Email notification sent to ${user.email}`);
    } catch (emailError) {
      console.error('❌ [PASSWORD CHANGE] Error sending email notification:', emailError);
      // Don't fail the request if email fails
    }

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

// @desc    Update FCM token
// @route   POST /api/users/fcm-token
// @access  Private
const updateFCMToken = async (req, res) => {
  console.log('\n📱 ========== [FCM TOKEN] UPDATE REQUEST ==========');
  console.log(`📱 [FCM TOKEN] Timestamp: ${new Date().toISOString()}`);
  
  try {
    const userId = req.user.id;
    const { fcmToken } = req.body;

    console.log(`📱 [FCM TOKEN] User ID: ${userId}`);
    console.log(`📱 [FCM TOKEN] Token received: ${fcmToken ? 'YES' : 'NO'}`);
    console.log(`📱 [FCM TOKEN] Token type: ${typeof fcmToken}`);
    console.log(`📱 [FCM TOKEN] Token length: ${fcmToken ? fcmToken.length : 'null'}`);
    console.log(`📱 [FCM TOKEN] Token preview: ${fcmToken ? fcmToken.substring(0, 50) + '...' : 'null'}`);

    if (!fcmToken) {
      console.error(`❌ [FCM TOKEN] ERROR: FCM token is missing in request body`);
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    // Check if token is valid format (FCM tokens are usually long strings)
    if (typeof fcmToken !== 'string' || fcmToken.trim().length < 10) {
      console.error(`❌ [FCM TOKEN] ERROR: Invalid token format`);
      console.error(`❌ [FCM TOKEN] Token too short or invalid type`);
      return res.status(400).json({
        success: false,
        message: 'Invalid FCM token format'
      });
    }

    // Get old token for comparison
    const oldUser = await User.findById(userId).select('fcmToken email fullName');
    const oldToken = oldUser?.fcmToken;
    
    console.log(`📱 [FCM TOKEN] Old token exists: ${oldToken ? 'YES' : 'NO'}`);
    if (oldToken) {
      console.log(`📱 [FCM TOKEN] Old token preview: ${oldToken.substring(0, 50)}...`);
      console.log(`📱 [FCM TOKEN] Token changed: ${oldToken !== fcmToken ? 'YES' : 'NO'}`);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true, select: 'fcmToken email fullName role' }
    );

    if (!user) {
      console.error(`❌ [FCM TOKEN] ERROR: User ${userId} not found in database`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`✅ [FCM TOKEN] SUCCESS: FCM token updated for user ${userId}`);
    console.log(`✅ [FCM TOKEN] User: ${user.fullName} (${user.email})`);
    console.log(`✅ [FCM TOKEN] Role: ${user.role}`);
    console.log(`✅ [FCM TOKEN] New token stored: ${user.fcmToken ? 'YES' : 'NO'}`);
    console.log(`📱 ========== [FCM TOKEN] UPDATE SUCCESS ==========\n`);

    res.status(200).json({
      success: true,
      message: 'FCM token updated successfully'
    });

  } catch (error) {
    console.error('Update FCM token error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating FCM token'
    });
  }
};

// @desc    Get resident's building and flat details
// @route   GET /api/users/building-details
// @access  Private (Resident)
const getBuildingDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'resident') {
      return res.status(403).json({
        success: false,
        message: 'Only residents can access building details'
      });
    }

    if (!user.apartmentCode) {
      return res.status(404).json({
        success: false,
        message: 'Building not assigned'
      });
    }

    // Get building details
    const building = await Apartment.findByCode(user.apartmentCode);
    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Get resident's flat details
    const flatDetails = building.getFlatDetails(user.floorNumber, user.flatNumber);

    res.status(200).json({
      success: true,
      data: {
        building: {
          id: building._id,
          name: building.name,
          code: building.code,
          address: building.address,
          contact: building.contact,
          createdAt: building.createdAt,
          updatedAt: building.updatedAt
        },
        flat: {
          floorNumber: user.floorNumber,
          flatNumber: user.flatNumber,
          flatCode: user.flatCode,
          flatType: user.flatType,
          squareFeet: flatDetails?.squareFeet,
          isOccupied: flatDetails?.isOccupied,
          registeredAt: user.registeredAt,
          lastUpdatedAt: user.lastUpdatedAt,
          createdAt: flatDetails?.createdAt,
          updatedAt: flatDetails?.updatedAt
        },
        resident: {
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          registeredAt: user.registeredAt,
          lastUpdatedAt: user.lastUpdatedAt,
          status: user.status,
          isVerified: user.isVerified
        }
      }
    });

  } catch (error) {
    console.error('Get building details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching building details'
    });
  }
};

// @desc    Get resident's announcements (filtered by building)
// @route   GET /api/users/announcements
// @access  Private (Resident)
const getAnnouncements = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'resident' || !user.apartmentCode) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get admin users for the same building to filter notices
    const buildingAdmins = await User.find({
      apartmentCode: user.apartmentCode,
      role: 'admin',
      status: 'active'
    }).select('_id');
    const adminIds = buildingAdmins.map(admin => admin._id);

    // Get announcements for the building (created by admins of the same building)
    const announcements = await Notice.find({
      createdBy: { $in: adminIds },
      $or: [
        { 'targetAudience.type': 'All' },
        {
          'targetAudience.type': 'Specific',
          $or: [
            { 'targetAudience.flatNumbers': user.flatNumber },
            { 'targetAudience.floors': user.floorNumber }
          ]
        }
      ],
      status: 'Published',
      'schedule.publishAt': { $lte: new Date() },
      $or: [
        { 'schedule.expireAt': { $exists: false } },
        { 'schedule.expireAt': { $gt: new Date() } }
      ]
    })
    .populate('createdBy', 'fullName role')
    .sort({ 'schedule.publishAt': -1 })
    .limit(50);

    res.status(200).json({
      success: true,
      data: {
        announcements,
        total: announcements.length
      }
    });

  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching announcements'
    });
  }
};

module.exports = {
  getUserDashboard,
  updateProfile,
  changePassword,
  updateFCMToken,
  getBuildingDetails,
  getAnnouncements
};