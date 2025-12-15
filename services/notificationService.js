const User = require('../models/User');
const Staff = require('../models/Staff');
const { emitToUser, broadcastToApartment } = require('./socketService');
const { sendPushNotification, sendMulticastPushNotification } = require('../config/firebase');

// Send notification to user
const sendUserNotification = async (userId, type, data) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const notification = {
      type,
      data,
      timestamp: new Date(),
      read: false
    };

    // Emit real-time notification via Socket.IO
    emitToUser(userId, 'notification', notification);

    // Send push notification via Firebase if FCM token exists
    if (user.fcmToken) {
      await sendPushNotification(
        user.fcmToken,
        {
          title: data.title || 'New Notification',
          body: data.message || data.body || 'You have a new notification',
        },
        {
          type: type,
          ...data
        }
      );
    }

    // TODO: Store notification in database for history
    // TODO: Send SMS if enabled and urgent

    console.log(`📢 Sent ${type} notification to user ${userId}`);
  } catch (error) {
    console.error('Send user notification error:', error);
  }
};

// Send notification to apartment
const sendApartmentNotification = async (apartmentCode, type, data) => {
  try {
    // Emit via Socket.IO
    broadcastToApartment(apartmentCode, 'apartment_notification', {
      type,
      data,
      timestamp: new Date()
    });

    // Send push notifications to all users in apartment
    const users = await User.find({
      apartmentCode,
      status: 'active',
      fcmToken: { $exists: true, $ne: null }
    }).select('fcmToken');

    if (users.length > 0) {
      const fcmTokens = users.map(u => u.fcmToken).filter(Boolean);
      if (fcmTokens.length > 0) {
        await sendMulticastPushNotification(
          fcmTokens,
          {
            title: data.title || 'New Notice',
            body: data.message || data.body || 'You have a new notification',
          },
          {
            type: type,
            ...data
          }
        );
      }
    }

    console.log(`📢 Sent ${type} notification to apartment ${apartmentCode}`);
  } catch (error) {
    console.error('Send apartment notification error:', error);
  }
};

// Send complaint status update notification
const sendComplaintStatusUpdate = async (complaint, oldStatus, newStatus) => {
  try {
    const notificationData = {
      complaintId: complaint._id,
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      oldStatus,
      newStatus,
      timestamp: new Date()
    };

    // Notify complaint creator
    await sendUserNotification(
      complaint.createdBy.toString(),
      'complaint_status_updated',
      notificationData
    );

    // Notify assigned staff if any
    if (complaint.assignedTo && complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff) {
        await sendUserNotification(
          staff.user._id.toString(),
          'complaint_status_updated',
          notificationData
        );
      }
    }

    // Notify admins
    const admins = await User.find({ role: 'admin', status: 'active' });
    for (const admin of admins) {
      await sendUserNotification(
        admin._id.toString(),
        'complaint_status_updated',
        notificationData
      );
    }
  } catch (error) {
    console.error('Send complaint status update error:', error);
  }
};

// Send new notice notification
const sendNewNoticeNotification = async (notice, apartmentCode) => {
  try {
    await sendApartmentNotification(
      apartmentCode,
      'new_notice',
      {
        noticeId: notice._id,
        title: notice.title,
        category: notice.category,
        priority: notice.priority,
        requiresAcknowledgement: notice.requiresAcknowledgement
      }
    );
  } catch (error) {
    console.error('Send new notice notification error:', error);
  }
};

module.exports = {
  sendUserNotification,
  sendApartmentNotification,
  sendComplaintStatusUpdate,
  sendNewNoticeNotification
};