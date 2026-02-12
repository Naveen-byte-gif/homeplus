const User = require('../models/User');
const Staff = require('../models/Staff');
const { sendPushNotification, sendMulticastPushNotification } = require('../config/firebase');
const {
  sendComplaintRegisteredEmail,
  sendComplaintStatusUpdateEmail,
  sendComplaintResolvedEmail,
  sendAdminNewComplaintEmail,
  sendAdminComplaintStatusChangeEmail,
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
    // Format timestamp
    const createdAt = new Date(complaint.createdAt).toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const notificationData = {
      type: 'ticket_created',
      ticketId: complaint._id.toString(),
      complaintId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      referenceId: complaint.ticketNumber, // For Flutter display
      title: complaint.title,
      category: complaint.category,
      priority: complaint.priority,
      status: complaint.status,
      dateTime: createdAt, // Formatted date/time for display
      formattedDate: new Date(complaint.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      formattedTime: new Date(complaint.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
      timestamp: complaint.createdAt ? new Date(complaint.createdAt).toISOString() : new Date().toISOString(),
    };

    // 1. Socket.IO real-time notification
    emitToUser(creator._id.toString(), 'ticket_created', {
      message: 'Your ticket has been created successfully',
      ...notificationData,
    });

    // 2. Always send FCM push notification to resident (important confirmation)
    console.log(`\n🔔 [NOTIFICATION] Checking FCM token for resident ${creator._id.toString()}`);
    console.log(`🔔 [NOTIFICATION] Resident name: ${creator.fullName}`);
    console.log(`🔔 [NOTIFICATION] Resident email: ${creator.email}`);
    console.log(`🔔 [NOTIFICATION] FCM token exists: ${creator.fcmToken ? 'YES' : 'NO'}`);
    if (creator.fcmToken) {
      console.log(`🔔 [NOTIFICATION] FCM token preview: ${creator.fcmToken.substring(0, 50)}...`);
      try {
        console.log(`🔔 [NOTIFICATION] Attempting to send FCM notification...`);
        const fcmResult = await sendPushNotification(
          creator.fcmToken,
          {
            title: '✅ Ticket Created Successfully',
            body: `Your ticket ${complaint.ticketNumber} has been created successfully. We'll notify you about updates.`,
          },
          notificationData
        );
        if (fcmResult.success) {
          console.log(`✅ [NOTIFICATION] FCM push SUCCESS to resident ${creator._id.toString()}`);
          console.log(`✅ [NOTIFICATION] FCM Message ID: ${fcmResult.messageId}`);
        } else {
          console.error(`❌ [NOTIFICATION] FCM push FAILED to resident ${creator._id.toString()}`);
          console.error(`❌ [NOTIFICATION] FCM Error: ${fcmResult.message}`);
          if (fcmResult.shouldRemove) {
            console.error(`⚠️ [NOTIFICATION] ACTION REQUIRED: Remove invalid FCM token from user ${creator._id.toString()}`);
          }
        }
      } catch (fcmError) {
        console.error(`❌ [NOTIFICATION] FCM push EXCEPTION for resident ${creator._id.toString()}:`, fcmError);
        console.error(`❌ [NOTIFICATION] Exception message: ${fcmError.message}`);
        console.error(`❌ [NOTIFICATION] Exception stack:`, fcmError.stack);
      }
    } else {
      console.warn(`⚠️ [NOTIFICATION] WARNING: No FCM token for resident ${creator._id.toString()}`);
      console.warn(`⚠️ [NOTIFICATION] Resident must update FCM token in app settings`);
    }

    // 3. Always send email notification to resident (important confirmation)
    if (creator.email) {
      try {
        await sendComplaintRegisteredEmail(creator, complaint);
        console.log(`✅ [NOTIFICATION] Email sent to resident ${creator.email}`);
      } catch (emailError) {
        console.error(`❌ [NOTIFICATION] Email failed:`, emailError.message);
      }
    }

    // Format residence location
    const residenceLocation = formatResidenceLocation(complaint, creator);

    // 4. Notify all admins from the same apartment with complete location information
    const admins = await User.find({ 
      role: 'admin', 
      status: 'active',
      apartmentCode: creator.apartmentCode // Only notify admins from same apartment
    });
    
    for (const admin of admins) {
      // Socket notification with location
      emitToUser(admin._id.toString(), 'new_ticket', {
        message: `New ticket ${complaint.ticketNumber} created by ${creator.fullName} at ${residenceLocation}`,
        ...notificationData,
        createdBy: creator.fullName,
        location: residenceLocation,
      });

      // Always send FCM push notification to admin (important updates)
      console.log(`\n🔔 [NOTIFICATION] Checking FCM token for admin ${admin._id.toString()}`);
      console.log(`🔔 [NOTIFICATION] Admin name: ${admin.fullName}`);
      console.log(`🔔 [NOTIFICATION] Admin email: ${admin.email}`);
      console.log(`🔔 [NOTIFICATION] FCM token exists: ${admin.fcmToken ? 'YES' : 'NO'}`);
      if (admin.fcmToken) {
        console.log(`🔔 [NOTIFICATION] FCM token preview: ${admin.fcmToken.substring(0, 50)}...`);
        try {
          console.log(`🔔 [NOTIFICATION] Attempting to send FCM notification to admin...`);
          const fcmResult = await sendPushNotification(
            admin.fcmToken,
            {
              title: '🚨 New Complaint Received',
              body: `${creator.fullName} created ticket ${complaint.ticketNumber}\n${residenceLocation}\nPriority: ${complaint.priority}`,
            },
            {
              ...notificationData,
              type: 'new_ticket',
              referenceId: complaint.ticketNumber,
              status: complaint.status,
              dateTime: new Date(complaint.createdAt).toLocaleString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short'
              }),
              formattedDate: new Date(complaint.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
              formattedTime: new Date(complaint.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
              locationText: residenceLocation,
              createdBy: creator.fullName,
            }
          );
          if (fcmResult.success) {
            console.log(`✅ [NOTIFICATION] FCM push SUCCESS to admin ${admin._id.toString()}`);
            console.log(`✅ [NOTIFICATION] FCM Message ID: ${fcmResult.messageId}`);
          } else {
            console.error(`❌ [NOTIFICATION] FCM push FAILED to admin ${admin._id.toString()}`);
            console.error(`❌ [NOTIFICATION] FCM Error: ${fcmResult.message}`);
            if (fcmResult.shouldRemove) {
              console.error(`⚠️ [NOTIFICATION] ACTION REQUIRED: Remove invalid FCM token from admin ${admin._id.toString()}`);
            }
          }
        } catch (fcmError) {
          console.error(`❌ [NOTIFICATION] FCM push EXCEPTION for admin ${admin._id.toString()}:`, fcmError);
          console.error(`❌ [NOTIFICATION] Exception message: ${fcmError.message}`);
          console.error(`❌ [NOTIFICATION] Exception stack:`, fcmError.stack);
        }
      } else {
        console.warn(`⚠️ [NOTIFICATION] WARNING: No FCM token for admin ${admin._id.toString()}`);
        console.warn(`⚠️ [NOTIFICATION] Admin must update FCM token in app settings`);
      }

      // Always send email notification to admin (important updates)
      if (admin.email) {
        try {
          await sendAdminNewComplaintEmail(admin.email, complaint, creator, residenceLocation);
          console.log(`✅ [NOTIFICATION] Email sent to admin ${admin.email}`);
        } catch (emailError) {
          console.error(`❌ [NOTIFICATION] Email failed for admin ${admin.email}:`, emailError.message);
        }
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

    // Format timestamp for display
    const formattedDateTime = new Date(updatedAt).toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const notificationData = {
      type: 'ticket_status_updated',
      ticketId: complaint._id.toString(),
      complaintId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      referenceId: complaint.ticketNumber, // For Flutter display
      title: complaint.title,
      oldStatus,
      newStatus,
      status: newStatus, // Current status for Flutter
      updatedBy: updatedByName,
      updatedByRole: updater?.role || 'admin',
      updatedAt: updatedAt,
      dateTime: formattedDateTime, // Formatted date/time for display
      formattedDate: new Date(updatedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      formattedTime: new Date(updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
      timestamp: updatedAt,
      // Include complete residence location (as string for FCM)
      residenceLocation: residenceLocation,
      locationText: residenceLocation, // For easy access
      category: complaint.category,
      priority: complaint.priority,
      // Location details (will be stringified by FCM service)
      apartmentCode: creator.apartmentCode || '',
      wing: (creator.wing || complaint.location?.wing || '').toString(),
      floorNumber: (creator.floorNumber || complaint.location?.floorNumber || '').toString(),
      flatNumber: (creator.flatNumber || complaint.location?.flatNumber || '').toString(),
      specificLocation: (complaint.location?.specificLocation || '').toString(),
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

    // Always send FCM push notification for status changes (important updates)
    console.log(`\n🔔 [NOTIFICATION] Status Update - Checking FCM token for resident ${creator._id.toString()}`);
    console.log(`🔔 [NOTIFICATION] Resident name: ${creator.fullName}`);
    console.log(`🔔 [NOTIFICATION] Resident email: ${creator.email}`);
    console.log(`🔔 [NOTIFICATION] Old Status: ${oldStatus}`);
    console.log(`🔔 [NOTIFICATION] New Status: ${newStatus}`);
    console.log(`🔔 [NOTIFICATION] FCM token exists: ${creator.fcmToken ? 'YES' : 'NO'}`);
    
    if (creator.fcmToken) {
      console.log(`🔔 [NOTIFICATION] FCM token preview: ${creator.fcmToken.substring(0, 50)}...`);
      // Enhanced notification body with friendly tone as requested
      const notificationBody = `Your complaint has been updated 👍\nWe're actively working on it.\n\nStatus: ${newStatus}`;

      try {
        console.log(`🔔 [NOTIFICATION] Attempting to send status update FCM notification...`);
        const fcmResult = await sendPushNotification(
          creator.fcmToken,
          {
            title: 'Ticket Status Updated',
            body: notificationBody,
          },
          {
            ...notificationData,
            locationText: residenceLocation,
          }
        );
        if (fcmResult.success) {
          console.log(`✅ [NOTIFICATION] FCM push SUCCESS to resident ${creator._id.toString()}`);
          console.log(`✅ [NOTIFICATION] FCM Message ID: ${fcmResult.messageId}`);
        } else {
          console.error(`❌ [NOTIFICATION] FCM push FAILED to resident ${creator._id.toString()}`);
          console.error(`❌ [NOTIFICATION] FCM Error: ${fcmResult.message}`);
          if (fcmResult.shouldRemove) {
            console.error(`⚠️ [NOTIFICATION] ACTION REQUIRED: Remove invalid FCM token from user ${creator._id.toString()}`);
          }
        }
      } catch (fcmError) {
        console.error(`❌ [NOTIFICATION] FCM push EXCEPTION for resident ${creator._id.toString()}:`, fcmError);
        console.error(`❌ [NOTIFICATION] Exception message: ${fcmError.message}`);
        console.error(`❌ [NOTIFICATION] Exception stack:`, fcmError.stack);
      }
    } else {
      console.warn(`⚠️ [NOTIFICATION] WARNING: No FCM token for resident ${creator._id.toString()}`);
      console.warn(`⚠️ [NOTIFICATION] Resident must update FCM token in app settings`);
    }

    // Always send email notification for status changes (important updates)
    if (creator.email) {
      try {
        await sendComplaintStatusUpdateEmail(creator, complaint, oldStatus, newStatus);
        console.log(`✅ [NOTIFICATION] Email notification sent to resident ${creator.email}`);
      } catch (emailError) {
        console.error(`❌ [NOTIFICATION] Email notification failed:`, emailError.message);
      }
    } else {
      console.log(`⚠️ [NOTIFICATION] No email address for resident ${creator._id.toString()}`);
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

    // 3. Notify all admins from the same apartment with complete location information
    const admins = await User.find({ 
      role: 'admin', 
      status: 'active',
      apartmentCode: creator.apartmentCode // Only notify admins from same apartment
    });

    for (const admin of admins) {
      // Send socket notification to all admins (including the one who made the change for record keeping)
      if (updater && updater.role === 'admin' && admin._id.toString() === updater._id.toString()) {
        // Send confirmation to the admin who made the change
        emitToUser(admin._id.toString(), 'status_change_confirmation', {
          ...notificationData,
          message: `You changed ticket ${complaint.ticketNumber} status from ${oldStatus} to ${newStatus}`,
        });
      } else {
        // Socket notification to other admins
        emitToUser(admin._id.toString(), 'ticket_status_updated', {
          ...notificationData,
          message: `Ticket ${complaint.ticketNumber} status changed to ${newStatus} by ${updatedByName}`,
          location: residenceLocation,
        });
      }

      // Always send FCM push notification to admin (important updates)
      if (admin.fcmToken) {
        try {
          await sendPushNotification(
            admin.fcmToken,
            {
              title: '📝 Complaint Status Updated',
              body: `Ticket #${complaint.ticketNumber}\n${oldStatus} → ${newStatus}\n${residenceLocation}`,
            },
            {
              ...notificationData,
              type: 'ticket_status_updated',
              referenceId: complaint.ticketNumber,
              status: newStatus,
              dateTime: new Date(updatedAt).toLocaleString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short'
              }),
              formattedDate: new Date(updatedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
              formattedTime: new Date(updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
              locationText: residenceLocation,
            }
          );
          console.log(`✅ [NOTIFICATION] FCM push sent to admin ${admin._id.toString()}`);
        } catch (fcmError) {
          console.error(`❌ [NOTIFICATION] FCM push failed for admin ${admin._id.toString()}:`, fcmError.message);
        }
      }

      // Always send email notification to admin (important updates)
      if (admin.email) {
        try {
          await sendAdminComplaintStatusChangeEmail(
            admin.email, 
            complaint, 
            oldStatus, 
            newStatus, 
            updatedByName, 
            residenceLocation
          );
          console.log(`✅ [NOTIFICATION] Email sent to admin ${admin.email}`);
        } catch (emailError) {
          console.error(`❌ [NOTIFICATION] Email failed for admin ${admin.email}:`, emailError.message);
        }
      }
    }

    // Also broadcast to admin room
    emitToRoom('admin', 'ticket_status_updated', {
      ...notificationData,
      message: `Ticket ${complaint.ticketNumber} status changed to ${newStatus} by ${updatedByName}`,
      location: residenceLocation,
    });

    console.log(`✅ [NOTIFICATION] Status update notifications sent for ${complaint.ticketNumber}`);
    console.log(`✅ [NOTIFICATION] Resident ${creator._id.toString()} notified via socket + FCM + Email`);
    console.log(`✅ [NOTIFICATION] ${admins.length} admin(s) notified via socket + FCM + Email`);
  } catch (error) {
    console.error('❌ [NOTIFICATION] Error sending status update notifications:', error);
    console.error('❌ [NOTIFICATION] Error stack:', error.stack);
  }
};

// Send notification for comment added (include full comment for immediate display)
const notifyCommentAdded = async (complaint, comment, postedBy) => {
  try {
    const creator = await User.findById(complaint.createdBy);
    const commenter = await User.findById(postedBy);

    if (!creator || !commenter) return;

    const commentPayload = comment.toObject ? comment.toObject() : {
      _id: comment._id,
      text: comment.text,
      postedBy: comment.postedBy && typeof comment.postedBy === 'object'
        ? { _id: comment.postedBy._id, fullName: comment.postedBy.fullName, role: comment.postedBy.role, profilePicture: comment.postedBy.profilePicture }
        : { _id: postedBy, fullName: commenter.fullName, role: commenter.role, profilePicture: commenter.profilePicture },
      postedAt: comment.postedAt,
      media: comment.media || [],
      isEdited: comment.isEdited || false,
    };

    const notificationData = {
      type: 'ticket_comment_added',
      ticketId: complaint._id.toString(),
      ticketNumber: complaint.ticketNumber,
      title: complaint.title,
      commentText: comment.text.substring(0, 100),
      postedBy: commenter.fullName,
      comment: commentPayload,
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

