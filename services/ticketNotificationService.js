const User = require('../models/User');
const Staff = require('../models/Staff');
const { sendPushNotification, sendMulticastPushNotification } = require('../config/firebase');
const {
  sendComplaintRegisteredEmail,
  sendComplaintStatusUpdateEmail,
  sendComplaintResolvedEmail,
} = require('./emailService');
const { emitToUser, emitToRoom } = require('./socketService');

/**
 * Comprehensive Ticket Notification Service
 * Handles all ticket-related notifications (Push + Email + Socket)
 */

// Helper function to format complete residence location
const formatResidenceLocation = (complaint, user) => {
  const locationParts = [];
  
  // Add apartment code if available
  if (user?.apartmentCode) {
    locationParts.push(`Apartment: ${user.apartmentCode}`);
  }
  
  // Add wing if available
  if (user?.wing || complaint?.location?.wing) {
    locationParts.push(`Wing: ${user.wing || complaint.location.wing}`);
  }
  
  // Add floor number if available
  if (user?.floorNumber || complaint?.location?.floorNumber) {
    locationParts.push(`Floor: ${user.floorNumber || complaint.location.floorNumber}`);
  }
  
  // Add flat number if available
  if (user?.flatNumber || complaint?.location?.flatNumber) {
    locationParts.push(`Flat: ${user.flatNumber || complaint.location.flatNumber}`);
  }
  
  // Add specific location if available
  if (complaint?.location?.specificLocation) {
    locationParts.push(`Location: ${complaint.location.specificLocation}`);
  }
  
  return locationParts.length > 0 ? locationParts.join(', ') : 'Location not specified';
};

// Send notification for ticket creation
const notifyTicketCreated = async (complaint) => {
  try {
    // Get complaint creator
    const creator = await User.findById(complaint.createdBy);
    if (!creator) return;

    // Prepare notification data
    const notificationData = {
      type: 'ticket_created',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      category: complaint.category,
      priority: complaint.priority,
      status: complaint.status,
    };

    // 1. Socket.IO real-time notification
    emitToUser(creator._id.toString(), 'ticket_created', {
      message: 'Your ticket has been created successfully',
      ...notificationData,
    });

    // 2. Push notification (if FCM token exists and user enabled push)
    if (creator.fcmToken && creator.notificationPreferences?.push) {
      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Ticket Created',
          body: `Your ticket ${complaint.ticketNumber} has been created successfully`,
        },
        notificationData
      );
    }

    // 3. Email notification (if user enabled email)
    if (creator.email && creator.notificationPreferences?.email) {
      await sendComplaintRegisteredEmail(creator, complaint);
    }

    // 4. Notify all admins with complete location information
    const admins = await User.find({ role: 'admin', status: 'active' });
    for (const admin of admins) {
      // Socket notification with location
      emitToUser(admin._id.toString(), 'new_ticket', {
        message: `New ticket ${complaint.ticketNumber} created by ${creator.fullName} at ${residenceLocation}`,
        ...notificationData,
        createdBy: creator.fullName,
      });

      // Push notification with location
      if (admin.fcmToken && admin.notificationPreferences?.push) {
        await sendPushNotification(
          admin.fcmToken,
          {
            title: 'New Ticket Created',
            body: `${creator.fullName} created ticket ${complaint.ticketNumber} - ${residenceLocation}`,
          },
          {
            ...notificationData,
            type: 'new_ticket',
          }
        );
      }
    }

    console.log(`✅ Ticket creation notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket creation notifications:', error);
  }
};

// Send notification for ticket assignment
const notifyTicketAssigned = async (complaint, staffId, assignedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const staff = await Staff.findById(staffId).populate('user');
    const assigner = await User.findById(assignedBy);

    if (!creator || !staff || !staff.user) return;

    const notificationData = {
      type: 'ticket_assigned',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      status: complaint.status,
      assignedTo: staff.user.fullName,
      assignedBy: assigner?.fullName || 'Admin',
    };

    // 1. Notify ticket creator (Resident)
    emitToUser(creator._id.toString(), 'ticket_assigned', {
      message: `Your ticket has been assigned to ${staff.user.fullName}`,
      ...notificationData,
    });

    if (creator.fcmToken && creator.notificationPreferences?.push) {
      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Ticket Assigned',
          body: `Your complaint has been updated 👍\nWe're actively working on it.\n\nAssigned to: ${staff.user.fullName}`,
        },
        notificationData
      );
    }

    if (creator.email && creator.notificationPreferences?.email) {
      await sendComplaintStatusUpdateEmail(
        creator,
        complaint,
        'Open',
        'Assigned'
      );
    }

    // 2. Notify assigned staff
    emitToUser(staff.user._id.toString(), 'ticket_assigned_to_you', {
      message: `New ticket ${complaint.ticketNumber} assigned to you`,
      ...notificationData,
    });

    if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
      await sendPushNotification(
        staff.user.fcmToken,
        {
          title: 'New Ticket Assigned',
          body: `Ticket ${complaint.ticketNumber}: ${complaint.title}`,
        },
        {
          ...notificationData,
          type: 'ticket_assigned_to_you',
        }
      );
    }

    console.log(`✅ Ticket assignment notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket assignment notifications:', error);
  }
};

// Send notification for status update
const notifyStatusUpdate = async (complaint, oldStatus, newStatus, updatedBy, options = {}) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const updater = await User.findById(updatedBy);

    if (!creator) return;

    // Format complete residence location
    const residenceLocation = formatResidenceLocation(complaint, creator);

    // Get update timestamp
    const updatedAt = options.updatedAt || new Date().toISOString();
    const updatedByName = options.updatedByName || updater?.fullName || 'Admin';

    const notificationData = {
      type: 'ticket_status_updated',
      ticketId: complaint._id.toString(),
      complaintId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      oldStatus,
      newStatus,
      updatedBy: updatedByName,
      updatedByRole: updater?.role || 'admin',
      updatedAt: updatedAt,
      timestamp: updatedAt,
      // Include complete residence location
      residenceLocation: residenceLocation,
      location: {
        apartmentCode: creator.apartmentCode,
        wing: creator.wing || complaint.location?.wing,
        floorNumber: creator.floorNumber || complaint.location?.floorNumber,
        flatNumber: creator.flatNumber || complaint.location?.flatNumber,
        specificLocation: complaint.location?.specificLocation,
      },
      category: complaint.category,
      priority: complaint.priority,
    };

    // 1. Notify ticket creator (Resident)
    console.log(`📤 [NOTIFICATION] Sending status update to resident: ${creator._id.toString()}`);
    console.log(`📤 [NOTIFICATION] Event: ticket_status_updated`);
    console.log(`📤 [NOTIFICATION] Data:`, JSON.stringify(notificationData, null, 2));
    
    emitToUser(creator._id.toString(), 'ticket_status_updated', {
      message: `Ticket ${complaint.ticketNumber} status changed to ${newStatus} by ${updatedByName}`,
      ...notificationData,
    });
    
    console.log(`✅ [NOTIFICATION] Status update notification sent to resident ${creator._id.toString()}`);

    if (creator.fcmToken && creator.notificationPreferences?.push) {
      // Enhanced notification body with friendly tone as requested
      const notificationBody = `Your complaint has been updated 👍\nWe're actively working on it.\n\nStatus: ${newStatus}`;

      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Ticket Status Updated',
          body: notificationBody,
          // Include location in notification data
          data: {
            ...notificationData,
            locationText: residenceLocation,
          },
        },
        notificationData
      );
    }

    if (creator.email && creator.notificationPreferences?.email) {
      await sendComplaintStatusUpdateEmail(creator, complaint, oldStatus, newStatus);
    }

    // 2. Notify assigned staff if exists
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff?.user) {
        emitToUser(staff.user._id.toString(), 'ticket_status_updated', {
          message: `Ticket ${complaint.ticketNumber} status updated to ${newStatus}`,
          ...notificationData,
        });

        if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
          // Enhanced notification for staff with location
          await sendPushNotification(
            staff.user.fcmToken,
            {
              title: 'Ticket Status Updated',
              body: `Ticket ${complaint.ticketNumber} (${residenceLocation}) is now ${newStatus}`,
            },
            notificationData
          );
        }
      }
    }

    // 3. Notify admins with complete location information
    emitToRoom('admin', 'ticket_status_updated', {
      ...notificationData,
      message: `Ticket ${complaint.ticketNumber} status changed to ${newStatus} by ${updatedByName}`,
    });

    // Also emit to individual admin who made the change (if admin)
    if (updater && updater.role === 'admin') {
      emitToUser(updater._id.toString(), 'status_change_confirmation', {
        ...notificationData,
        message: `You changed ticket ${complaint.ticketNumber} status from ${oldStatus} to ${newStatus}`,
      });
    }

    console.log(`✅ [NOTIFICATION] Status update notifications sent for ${complaint.ticketNumber}`);
    console.log(`✅ [NOTIFICATION] Resident ${creator._id.toString()} notified via socket`);
    console.log(`✅ [NOTIFICATION] Push notification ${creator.fcmToken ? 'sent' : 'skipped (no FCM token)'}`);
    console.log(`✅ [NOTIFICATION] Email notification ${creator.email && creator.notificationPreferences?.email ? 'sent' : 'skipped'}`);
  } catch (error) {
    console.error('❌ [NOTIFICATION] Error sending status update notifications:', error);
    console.error('❌ [NOTIFICATION] Error stack:', error.stack);
  }
};

// Send notification for comment added
const notifyCommentAdded = async (complaint, comment, postedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const commenter = await User.findById(postedBy);

    if (!creator || !commenter) return;

    const notificationData = {
      type: 'ticket_comment_added',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      commentText: comment.text.substring(0, 100),
      postedBy: commenter.fullName,
    };

    // Notify ticket creator (if comment is not from them)
    if (creator._id.toString() !== postedBy.toString()) {
      emitToUser(creator._id.toString(), 'ticket_comment_added', {
        message: `${commenter.fullName} commented on your ticket`,
        ...notificationData,
      });

      if (creator.fcmToken && creator.notificationPreferences?.push) {
        await sendPushNotification(
          creator.fcmToken,
          {
            title: 'New Comment',
            body: `Your complaint has been updated 👍\n${commenter.fullName} replied to your complaint.\nWe're actively working on it.`,
          },
          notificationData
        );
      }
    }

    // Notify assigned staff (if comment is not from them)
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff?.user && staff.user._id.toString() !== postedBy.toString()) {
        emitToUser(staff.user._id.toString(), 'ticket_comment_added', {
          message: `${commenter.fullName} commented on ticket ${complaint.ticketNumber}`,
          ...notificationData,
        });

        if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
          await sendPushNotification(
            staff.user.fcmToken,
            {
              title: 'New Comment',
              body: `${commenter.fullName} commented on ticket ${complaint.ticketNumber}`,
            },
            notificationData
          );
        }
      }
    }

    // Notify admins
    emitToRoom('admin', 'ticket_comment_added', notificationData);

    console.log(`✅ Comment notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending comment notifications:', error);
  }
};

// Send notification for work update
const notifyWorkUpdate = async (complaint, workUpdate, updatedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const updater = await User.findById(updatedBy);

    if (!creator) return;

    const notificationData = {
      type: 'work_update_added',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      updateDescription: workUpdate.description.substring(0, 100),
      updatedBy: updater?.fullName || 'Staff',
    };

    // Notify ticket creator
    emitToUser(creator._id.toString(), 'work_update_added', {
      message: `Work update added to ticket ${complaint.ticketNumber}`,
      ...notificationData,
    });

    if (creator.fcmToken && creator.notificationPreferences?.push) {
      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Work Update',
          body: `Progress update on ticket ${complaint.ticketNumber}`,
        },
        notificationData
      );
    }

    // Notify admins
    emitToRoom('admin', 'work_update_added', notificationData);

    console.log(`✅ Work update notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending work update notifications:', error);
  }
};

// Send notification for ticket resolved
const notifyTicketResolved = async (complaint, resolvedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const resolver = await User.findById(resolvedBy);

    if (!creator) return;

    const notificationData = {
      type: 'ticket_resolved',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      resolvedBy: resolver?.fullName || 'Staff',
      resolvedAt: complaint.resolution?.resolvedAt,
    };

    // Notify ticket creator
    emitToUser(creator._id.toString(), 'ticket_resolved', {
      message: `Ticket ${complaint.ticketNumber} has been resolved`,
      ...notificationData,
    });

    if (creator.fcmToken && creator.notificationPreferences?.push) {
      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Ticket Resolved',
          body: `Your complaint has been updated 👍\nIssue resolved! Please verify and close.\nWe're actively working on it.`,
        },
        notificationData
      );
    }

    if (creator.email && creator.notificationPreferences?.email) {
      await sendComplaintResolvedEmail(creator, complaint);
    }

    // Notify admins
    emitToRoom('admin', 'ticket_resolved', notificationData);

    console.log(`✅ Ticket resolved notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket resolved notifications:', error);
  }
};

// Send notification for ticket closed
const notifyTicketClosed = async (complaint, closedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const closer = await User.findById(closedBy);

    if (!creator) return;

    const notificationData = {
      type: 'ticket_closed',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      closedBy: closer?.fullName || 'You',
    };

    // Notify assigned staff if exists
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff?.user) {
        emitToUser(staff.user._id.toString(), 'ticket_closed', {
          message: `Ticket ${complaint.ticketNumber} has been closed`,
          ...notificationData,
        });

        if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
          await sendPushNotification(
            staff.user.fcmToken,
            {
              title: 'Ticket Closed',
              body: `Ticket ${complaint.ticketNumber} has been closed by resident`,
            },
            notificationData
          );
        }
      }
    }

    // Notify admins
    emitToRoom('admin', 'ticket_closed', notificationData);

    console.log(`✅ Ticket closed notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket closed notifications:', error);
  }
};

// Send notification for ticket reopened
const notifyTicketReopened = async (complaint, reopenedBy, reason) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const reopener = await User.findById(reopenedBy);

    if (!creator) return;

    const notificationData = {
      type: 'ticket_reopened',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      reopenedBy: reopener?.fullName || 'Resident',
      reason: reason || 'Issue persists',
    };

    // Notify assigned staff if exists
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff?.user) {
        emitToUser(staff.user._id.toString(), 'ticket_reopened', {
          message: `Ticket ${complaint.ticketNumber} has been reopened`,
          ...notificationData,
        });

        if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
          await sendPushNotification(
            staff.user.fcmToken,
            {
              title: 'Ticket Reopened',
              body: `Ticket ${complaint.ticketNumber} has been reopened`,
            },
            notificationData
          );
        }
      }
    }

    // Notify admins
    emitToRoom('admin', 'ticket_reopened', notificationData);

    console.log(`✅ Ticket reopened notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket reopened notifications:', error);
  }
};

// Send notification for ticket cancelled
const notifyTicketCancelled = async (complaint, cancelledBy, reason) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const canceller = await User.findById(cancelledBy);

    if (!creator) return;

    const notificationData = {
      type: 'ticket_cancelled',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      cancelledBy: canceller?.fullName || 'System',
      reason: reason || 'No reason provided',
    };

    // Notify ticket creator
    emitToUser(creator._id.toString(), 'ticket_cancelled', {
      message: `Ticket ${complaint.ticketNumber} has been cancelled`,
      ...notificationData,
    });

    if (creator.fcmToken && creator.notificationPreferences?.push) {
      await sendPushNotification(
        creator.fcmToken,
        {
          title: 'Ticket Cancelled',
          body: `Ticket ${complaint.ticketNumber} has been cancelled`,
        },
        notificationData
      );
    }

    // Notify assigned staff if exists
    if (complaint.assignedTo?.staff) {
      const staff = await Staff.findById(complaint.assignedTo.staff).populate('user');
      if (staff?.user) {
        emitToUser(staff.user._id.toString(), 'ticket_cancelled', {
          message: `Ticket ${complaint.ticketNumber} has been cancelled`,
          ...notificationData,
        });

        if (staff.user.fcmToken && staff.user.notificationPreferences?.push) {
          await sendPushNotification(
            staff.user.fcmToken,
            {
              title: 'Ticket Cancelled',
              body: `Ticket ${complaint.ticketNumber} assigned to you has been cancelled`,
            },
            notificationData
          );
        }
      }
    }

    // Notify admins
    emitToRoom('admin', 'ticket_cancelled', notificationData);

    console.log(`✅ Ticket cancelled notifications sent for ${complaint.ticketNumber}`);
  } catch (error) {
    console.error('Error sending ticket cancelled notifications:', error);
  }
};

module.exports = {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusUpdate,
  notifyCommentAdded,
  notifyWorkUpdate,
  notifyTicketResolved,
  notifyTicketClosed,
  notifyTicketReopened,
  notifyTicketCancelled,
};

