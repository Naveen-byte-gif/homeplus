const Notice = require('../models/Notice');
const User = require('../models/User');
const { emitToUser, emitToRoom, broadcastToApartment } = require('../services/socketService');

// @desc    Create new notice
// @route   POST /api/notices
// @access  Private (Admin)
const createNotice = async (req, res) => {
  try {
    const adminId = req.user.id;
    const noticeData = req.body;

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Create notice
    const notice = await Notice.create({
      ...noticeData,
      createdBy: adminId,
      status: noticeData.schedule?.publishAt > new Date() ? 'Draft' : 'Published'
    });

    // If notice is published immediately, send notifications
    if (notice.status === 'Published') {
      await sendNoticeNotifications(notice, admin.apartmentCode);
    }

    await notice.populate('createdBy', 'fullName');

    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: { notice }
    });

  } catch (error) {
    console.error('Create notice error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating notice'
    });
  }
};

// @desc    Get all notices
// @route   GET /api/notices
// @access  Private
const getNotices = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, category, priority } = req.query;

    // Get user's apartment code
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Build filter for active notices
    const now = new Date();
    const filter = {
      status: 'Published',
      'schedule.publishAt': { $lte: now },
      $or: [
        { 'schedule.expireAt': { $gt: now } },
        { 'schedule.expireAt': { $exists: false } }
      ]
    };

    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    // Pagination
    const skip = (page - 1) * limit;

    const notices = await Notice.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ 'schedule.publishAt': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notice.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        notices,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get notices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notices'
    });
  }
};

// @desc    Get notice by ID
// @route   GET /api/notices/:id
// @access  Private
const getNotice = async (req, res) => {
  try {
    const noticeId = req.params.id;
    const userId = req.user.id;

    const notice = await Notice.findById(noticeId)
      .populate('createdBy', 'fullName')
      .populate('readBy.user', 'fullName');

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Mark as read if user hasn't read it yet
    await notice.markAsRead(userId);

    res.status(200).json({
      success: true,
      data: { notice }
    });

  } catch (error) {
    console.error('Get notice error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notice'
    });
  }
};

// @desc    Update notice
// @route   PUT /api/notices/:id
// @access  Private (Admin)
const updateNotice = async (req, res) => {
  try {
    const noticeId = req.params.id;
    const updateData = req.body;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Update notice
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        notice[key] = updateData[key];
      }
    });

    await notice.save();
    await notice.populate('createdBy', 'fullName');

    res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: { notice }
    });

  } catch (error) {
    console.error('Update notice error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notice'
    });
  }
};

// @desc    Publish notice
// @route   PUT /api/notices/:id/publish
// @access  Private (Admin)
const publishNotice = async (req, res) => {
  try {
    const noticeId = req.params.id;

    const notice = await Notice.findById(noticeId);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Get admin's apartment code for broadcasting
    const admin = await User.findById(notice.createdBy);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Publish notice
    notice.status = 'Published';
    notice.schedule.publishAt = new Date();
    await notice.save();

    // Send notifications
    await sendNoticeNotifications(notice, admin.apartmentCode);

    res.status(200).json({
      success: true,
      message: 'Notice published successfully',
      data: { notice }
    });

  } catch (error) {
    console.error('Publish notice error:', error);
    res.status(500).json({
      success: false,
      message: 'Error publishing notice'
    });
  }
};

// Helper function to send notice notifications
const sendNoticeNotifications = async (notice, apartmentCode) => {
  // Broadcast to all users in the apartment
  broadcastToApartment(apartmentCode, 'new_notice', {
    message: 'New notice published',
    notice: {
      id: notice._id,
      title: notice.title,
      category: notice.category,
      priority: notice.priority,
      publishAt: notice.schedule.publishAt
    }
  });

  // Update engagement metrics
  const totalUsers = await User.countDocuments({
    apartmentCode,
    status: 'active'
  });
  
  notice.engagement.totalSent = totalUsers;
  await notice.save();
};

module.exports = {
  createNotice,
  getNotices,
  getNotice,
  updateNotice,
  publishNotice
};