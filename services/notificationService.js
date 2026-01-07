const User = require("../models/User");
const Staff = require("../models/Staff");
const { emitToUser, broadcastToApartment } = require("./socketService");
const {
  sendPushNotification,
  sendMulticastPushNotification,
} = require("../config/firebase");

// Send notification to user (Professional implementation with proper error handling)
const sendUserNotification = async (userId, type, data) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`⚠️ [NOTIFICATION] User ${userId} not found`);
      return { success: false, message: "User not found" };
    }

    // Check user notification preferences
    const preferences = user.notificationPreferences || {};
    const pushEnabled = preferences.push !== false; // Default to true if not set

    const notification = {
      type,
      data: {
        ...data,
        timestamp: data.timestamp || new Date(),
      },
      timestamp: new Date(),
      read: false,
    };

    // Always emit real-time notification via Socket.IO (for instant UI updates)
    try {
      emitToUser(userId.toString(), "notification", notification);
      emitToUser(userId.toString(), type, notification.data); // Also emit type-specific event
      console.log(
        `✅ [NOTIFICATION] Socket.IO event emitted: ${type} to user ${userId}`
      );
    } catch (socketError) {
      console.error(
        `❌ [NOTIFICATION] Socket.IO error for user ${userId}:`,
        socketError
      );
      // Continue even if socket fails
    }

    // Send push notification via Firebase if FCM token exists and push is enabled
    if (user.fcmToken && pushEnabled) {
      try {
        const pushResult = await sendPushNotification(
          user.fcmToken,
          {
            title: data.title || "New Notification",
            body: data.message || data.body || "You have a new notification",
            imageUrl: data.imageUrl,
          },
          {
            type: type,
            ...data,
            userId: userId.toString(),
          }
        );

        if (!pushResult.success && pushResult.shouldRemove) {
          // Remove invalid FCM token
          await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
          console.log(
            `⚠️ [NOTIFICATION] Removed invalid FCM token for user ${userId}`
          );
        }

        console.log(
          `✅ [NOTIFICATION] Push notification sent: ${type} to user ${userId}`
        );
      } catch (pushError) {
        console.error(
          `❌ [NOTIFICATION] Push notification error for user ${userId}:`,
          pushError
        );
        // Continue even if push fails
      }
    } else if (!pushEnabled) {
      console.log(
        `ℹ️ [NOTIFICATION] Push notifications disabled for user ${userId}`
      );
    } else if (!user.fcmToken) {
      console.log(`ℹ️ [NOTIFICATION] No FCM token for user ${userId}`);
    }

    // TODO: Store notification in database for history
    // TODO: Send SMS if enabled and urgent

    return { success: true, type, userId: userId.toString() };
  } catch (error) {
    console.error(
      `❌ [NOTIFICATION] Send user notification error for user ${userId}:`,
      error
    );
    return { success: false, error: error.message };
  }
};

// Send notification to apartment
const sendApartmentNotification = async (apartmentCode, type, data) => {
  try {
    // Emit via Socket.IO
    broadcastToApartment(apartmentCode, "apartment_notification", {
      type,
      data,
      timestamp: new Date(),
    });

    // Send push notifications to all users in apartment
    const users = await User.find({
      apartmentCode,
      status: "active",
      fcmToken: { $exists: true, $ne: null },
    }).select("fcmToken");

    if (users.length > 0) {
      const fcmTokens = users.map((u) => u.fcmToken).filter(Boolean);
      if (fcmTokens.length > 0) {
        await sendMulticastPushNotification(
          fcmTokens,
          {
            title: data.title || "New Notice",
            body: data.message || data.body || "You have a new notification",
          },
          {
            type: type,
            ...data,
          }
        );
      }
    }

    console.log(`📢 Sent ${type} notification to apartment ${apartmentCode}`);
  } catch (error) {
    console.error("Send apartment notification error:", error);
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
      timestamp: new Date(),
    };

    // Notify complaint creator
    await sendUserNotification(
      complaint.createdBy.toString(),
      "complaint_status_updated",
      notificationData
    );

    // Notify assigned staff if any
    if (complaint.assignedTo && complaint.assignedTo.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate(
        "user"
      );
      if (staff) {
        await sendUserNotification(
          staff.user._id.toString(),
          "complaint_status_updated",
          notificationData
        );
      }
    }

    // Notify admins
    const admins = await User.find({ role: "admin", status: "active" });
    for (const admin of admins) {
      await sendUserNotification(
        admin._id.toString(),
        "complaint_status_updated",
        notificationData
      );
    }
  } catch (error) {
    console.error("Send complaint status update error:", error);
  }
};

// Send new notice notification
const sendNewNoticeNotification = async (notice, apartmentCode) => {
  try {
    await sendApartmentNotification(apartmentCode, "new_notice", {
      noticeId: notice._id,
      title: notice.title,
      category: notice.category,
      priority: notice.priority,
      requiresAcknowledgement: notice.requiresAcknowledgement,
    });
  } catch (error) {
    console.error("Send new notice notification error:", error);
  }
};

// Send visitor notification to flat owner (Professional implementation)
const sendVisitorNotification = async (
  hostResidentId,
  notificationType,
  visitorData
) => {
  try {
    const notificationData = {
      title: visitorData.title || "Visitor Update",
      message: visitorData.message || "You have a visitor update",
      visitorId: visitorData.visitorId,
      visitorName: visitorData.visitorName,
      visitorType: visitorData.visitorType,
      flatNumber: visitorData.flatNumber,
      timestamp: new Date(),
      ...visitorData,
    };

    return await sendUserNotification(
      hostResidentId.toString(),
      `visitor_${notificationType}`,
      notificationData
    );
  } catch (error) {
    console.error("Send visitor notification error:", error);
    return { success: false, error: error.message };
  }
};

// Send notification to user when account is created
const sendUserAccountCreatedNotification = async (user) => {
  try {
    const notificationData = {
      title: "🎉 Account Created Successfully!",
      message: `Welcome to ApartmentSync, ${user.fullName}! Your account has been created and is ready to use.`,
      userId: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      apartmentCode: user.apartmentCode,
      flatNumber: user.flatNumber,
      floorNumber: user.floorNumber,
      timestamp: new Date(),
    };

    return await sendUserNotification(
      user._id.toString(),
      "account_created",
      notificationData
    );
  } catch (error) {
    console.error("Send user account created notification error:", error);
    return { success: false, error: error.message };
  }
};

// Send notification to user when account status changes
const sendUserStatusChangeNotification = async (user, oldStatus, newStatus, reason = null) => {
  try {
    const statusMessages = {
      'active': {
        title: "✅ Account Activated",
        message: `Your ApartmentSync account has been activated! You can now access all features.`
      },
      'approved': {
        title: "✅ Account Approved",
        message: `Your ApartmentSync account has been approved by the administration. Welcome!`
      },
      'rejected': {
        title: "❌ Account Rejected",
        message: `Your account registration has been rejected. ${reason ? `Reason: ${reason}` : 'Please contact admin for details.'}`
      },
      'suspended': {
        title: "⚠️ Account Suspended",
        message: `Your account has been suspended. ${reason ? `Reason: ${reason}` : 'Please contact admin for assistance.'}`
      },
      'pending': {
        title: "⏳ Account Pending",
        message: `Your account is pending approval from the administration.`
      }
    };

    const statusInfo = statusMessages[newStatus.toLowerCase()] || statusMessages['pending'];

    const notificationData = {
      title: statusInfo.title,
      message: statusInfo.message,
      userId: user._id.toString(),
      fullName: user.fullName,
      oldStatus: oldStatus || 'unknown',
      newStatus: newStatus,
      reason: reason,
      timestamp: new Date(),
    };

    return await sendUserNotification(
      user._id.toString(),
      "account_status_changed",
      notificationData
    );
  } catch (error) {
    console.error("Send user status change notification error:", error);
    return { success: false, error: error.message };
  }
};

// Send notification to admin when new user is created
const sendAdminNewUserNotification = async (adminId, user) => {
  try {
    const notificationData = {
      title: "👤 New User Account Created",
      message: `A new ${user.role === 'resident' ? 'resident' : 'staff'} account has been created: ${user.fullName}`,
      userId: user._id.toString(),
      userFullName: user.fullName,
      userEmail: user.email,
      userRole: user.role,
      apartmentCode: user.apartmentCode,
      flatNumber: user.flatNumber,
      floorNumber: user.floorNumber,
      timestamp: new Date(),
    };

    return await sendUserNotification(
      adminId.toString(),
      "new_user_created",
      notificationData
    );
  } catch (error) {
    console.error("Send admin new user notification error:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendUserNotification,
  sendApartmentNotification,
  sendComplaintStatusUpdate,
  sendNewNoticeNotification,
  sendVisitorNotification,
  sendUserAccountCreatedNotification,
  sendUserStatusChangeNotification,
  sendAdminNewUserNotification,
};
