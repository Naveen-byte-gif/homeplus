const Visitor = require("../models/Visitor");
const User = require("../models/User");
const { emitSocketEvent, emitToUser } = require("../services/socketService");

/**
 * @desc    Get all visitors with role-based filtering
 * @route   GET /api/visitors
 * @access  Private (Admin, Staff, Resident)
 */
exports.getAllVisitors = async (req, res) => {
  try {
    const { role, _id, apartmentCode, wing, flatNumber } = req.user;
    const { status, building, flat, search, page = 1, limit = 50 } = req.query;

    // Build query based on role
    let query = {};

    // Role-based access control
    if (role === "resident") {
      // Residents can only see visitors for their own flat
      query.hostResident = _id;
      if (apartmentCode) query.apartmentCode = apartmentCode;
      if (wing) query.building = wing.toUpperCase();
      if (flatNumber) query.flatNumber = flatNumber.toUpperCase();
    } else if (role === "staff") {
      // Staff can see visitors for their assigned apartment
      if (apartmentCode) query.apartmentCode = apartmentCode;
    } else if (role === "admin") {
      // Admin can see all visitors
      // No restrictions
    }

    // Apply filters
    if (status) {
      query.status = status;
    }
    if (building) {
      query.building = building.toUpperCase();
    }
    if (flat) {
      query.flatNumber = flat.toUpperCase();
    }
    if (search) {
      query.$or = [
        { visitorName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { visitorType: { $regex: search, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get visitors
    const visitors = await Visitor.find(query)
      .populate("hostResident", "fullName phoneNumber wing flatNumber email")
      .populate("createdBy", "fullName role email phoneNumber")
      .populate("checkedInBy", "fullName role")
      .populate("checkedOutBy", "fullName role")
      .sort({ entryDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Visitor.countDocuments(query);

    // Calculate statistics
    const stats = {
      total: total,
      pending: await Visitor.countDocuments({ ...query, status: "Pending" }),
      checkedIn: await Visitor.countDocuments({
        ...query,
        status: "Checked In",
      }),
      checkedOut: await Visitor.countDocuments({
        ...query,
        status: "Checked Out",
      }),
      overdue: await Visitor.countDocuments({
        ...query,
        status: "Checked In",
        expectedCheckOutTime: { $lt: new Date() },
      }),
    };

    res.status(200).json({
      success: true,
      data: {
        visitors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Error getting visitors:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching visitors",
      error: error.message,
    });
  }
};

/**
 * @desc    Get visitor by ID
 * @route   GET /api/visitors/:id
 * @access  Private (Admin, Staff, Resident - own flat only)
 */
exports.getVisitorById = async (req, res) => {
  try {
    const { role, _id, apartmentCode, wing, flatNumber } = req.user;
    const { id } = req.params;

    const visitor = await Visitor.findById(id)
      .populate("hostResident", "fullName phoneNumber wing flatNumber email")
      .populate("createdBy", "fullName role email phoneNumber")
      .populate("checkedInBy", "fullName role")
      .populate("checkedOutBy", "fullName role")
      .populate("approvedBy", "fullName")
      .populate("rejectedBy", "fullName");

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    // Role-based access control
    if (role === "resident") {
      // Residents can only view visitors for their own flat
      if (visitor.hostResident._id.toString() !== _id.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view visitors for your own flat.",
        });
      }
    } else if (role === "staff") {
      // Staff can view visitors in their assigned apartment
      if (visitor.apartmentCode !== apartmentCode) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view visitors in your assigned apartment.",
        });
      }
    }

    res.status(200).json({
      success: true,
      data: { visitor },
    });
  } catch (error) {
    console.error("Error getting visitor:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching visitor",
      error: error.message,
    });
  }
};

/**
 * @desc    Create new visitor entry
 * @route   POST /api/visitors
 * @access  Private (Admin, Staff only - Residents are view-only)
 */
exports.createVisitor = async (req, res) => {
  try {
    const { role, _id, apartmentCode, wing, flatNumber } = req.user;

    // Residents cannot create visitors - they are view-only for their own flat
    if (role === "resident") {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Residents can only view visitors for their own flat. Please contact staff or admin to create visitor entries.",
      });
    }

    const {
      visitorName,
      phoneNumber,
      email,
      visitorType,
      building,
      flatNumber: visitorFlatNumber,
      floorNumber,
      purpose,
      vehicleNumber,
      carryingMaterial,
      numberOfVisitors,
      expectedCheckOutTime,
      nightTimeAccess,
      visitorPhoto,
    } = req.body;

    // Validate required fields
    if (
      !visitorName ||
      !phoneNumber ||
      !visitorType ||
      !building ||
      !visitorFlatNumber ||
      !floorNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Normalize phone number - remove all non-digit characters and extract last 10 digits
    let normalizedPhoneNumber = phoneNumber.toString().replace(/\D/g, ""); // Remove all non-digits

    // If phone number is longer than 10 digits, take the last 10 digits (handles country codes)
    if (normalizedPhoneNumber.length > 10) {
      normalizedPhoneNumber = normalizedPhoneNumber.slice(-10);
    }

    // Validate normalized phone number (must be exactly 10 digits starting with 6-9)
    if (
      normalizedPhoneNumber.length !== 10 ||
      !/^[6-9]/.test(normalizedPhoneNumber)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid Indian phone number (10 digits starting with 6-9)",
      });
    }

    // Determine host resident
    let hostResidentId;

    // Admin/Staff must specify hostResidentId or find by flat
    if (req.body.hostResidentId) {
      hostResidentId = req.body.hostResidentId;
    } else {
      // Find resident by apartment, building, and flat
      const hostResident = await User.findOne({
        apartmentCode: apartmentCode || req.body.apartmentCode,
        wing: building,
        flatNumber: visitorFlatNumber,
        role: "resident",
        status: "active",
      });

      if (!hostResident) {
        return res.status(404).json({
          success: false,
          message: "Resident not found for the specified flat",
        });
      }
      hostResidentId = hostResident._id;
    }

    // Verify host resident exists
    const hostResident = await User.findById(hostResidentId);
    if (!hostResident) {
      return res.status(404).json({
        success: false,
        message: "Host resident not found",
      });
    }

    // Create visitor with normalized phone number - explicitly set entryDate for exact timestamp
    const entryDate = new Date(); // Exact entry time
    const visitor = await Visitor.create({
      visitorName,
      phoneNumber: normalizedPhoneNumber, // Use normalized phone number
      email,
      visitorType,
      apartmentCode:
        apartmentCode || req.body.apartmentCode || hostResident.apartmentCode,
      building: building.toUpperCase(),
      flatNumber: visitorFlatNumber.toUpperCase(),
      floorNumber,
      purpose,
      hostResident: hostResidentId,
      vehicleNumber,
      carryingMaterial: carryingMaterial || false,
      numberOfVisitors: numberOfVisitors || 1,
      expectedCheckOutTime: expectedCheckOutTime
        ? new Date(expectedCheckOutTime)
        : null,
      nightTimeAccess: nightTimeAccess || {
        allowed: false,
        requiresApproval: true,
      },
      visitorPhoto: visitorPhoto || null,
      status: "Checked In", // Set to Checked In since checkInTime is set on creation
      checkInMethod: "Manual",
      entryDate: entryDate, // Explicitly set entry date with exact timestamp
      checkInTime: entryDate, // Set checkInTime same as entryDate for Login time
      checkedInBy: req.user._id, // Track who checked in the visitor
      createdBy: req.user._id, // Track who created the visitor entry
    });

    // Populate and return - include creator details and email for email notifications
    const populatedVisitor = await Visitor.findById(visitor._id)
      .populate(
        "hostResident",
        "fullName email phoneNumber wing flatNumber profilePicture fcmToken"
      )
      .populate("createdBy", "fullName role email phoneNumber");

    // Get notification and email services
    const { sendUserNotification } = require("../services/notificationService");
    const { sendVisitorEntryEmail } = require("../services/emailService");

    // IMPORTANT: Notify flat owner (host resident) in real-time + EMAIL
    if (populatedVisitor.hostResident && populatedVisitor.hostResident._id) {
      const hostResident = populatedVisitor.hostResident;
      const notificationData = {
        title: "New Visitor Entry",
        message: `${visitorName} has been registered as a visitor for your flat ${hostResident.wing}-${hostResident.flatNumber}`,
        visitorId: visitor._id.toString(),
        visitorName: visitorName,
        visitorType: visitorType,
        phoneNumber: normalizedPhoneNumber, // Use normalized phone number
        flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
        purpose: purpose || "Not specified",
        status: visitor.status,
        entryDate: visitor.entryDate || entryDate, // Use exact entry date
        timestamp: new Date(),
      };

      // Send real-time notification to flat owner
      await sendUserNotification(
        hostResident._id.toString(),
        "visitor_created",
        notificationData
      );

      // Send EMAIL notification to flat owner (PROFESSIONAL - with exact timestamp)
      if (hostResident.email) {
        try {
          const emailResult = await sendVisitorEntryEmail(hostResident, {
            visitorName: visitorName,
            phoneNumber: normalizedPhoneNumber, // Use normalized phone number
            visitorType: visitorType,
            flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
            purpose: purpose,
            vehicleNumber: vehicleNumber,
            status: visitor.status,
            entryDate: visitor.entryDate || entryDate, // Use exact entry date
            expectedCheckOutTime: visitor.expectedCheckOutTime,
            visitorId: visitor._id.toString(),
          });
          if (emailResult.success) {
            console.log(
              `✅ [EMAIL] Visitor entry email sent to ${hostResident.email}`
            );
          } else {
            console.warn(
              `⚠️ [EMAIL] Failed to send email to ${hostResident.email}: ${emailResult.message}`
            );
          }
        } catch (emailError) {
          console.error(
            `❌ [EMAIL] Error sending visitor entry email to ${hostResident.email}:`,
            emailError
          );
          // Continue even if email fails - don't block visitor creation
        }
      } else {
        console.warn(
          `⚠️ [EMAIL] Host resident ${hostResident._id} does not have an email address configured`
        );
      }

      // Also emit socket event for real-time UI updates
      emitToUser(hostResident._id.toString(), "visitor_created", {
        visitor: populatedVisitor,
        notification: notificationData,
      });

      console.log(
        `✅ [VISITOR] Notified flat owner ${hostResident._id} about visitor ${visitor._id}`
      );
    }

    // Log creator details for verification
    if (populatedVisitor.createdBy) {
      console.log(
        `✅ [VISITOR] Created by: ${populatedVisitor.createdBy.fullName} (${populatedVisitor.createdBy.role})`
      );
    }

    // Emit socket event to apartment room (for staff/admin monitoring)
    emitSocketEvent("visitor_created", {
      visitor: populatedVisitor,
      apartmentCode: populatedVisitor.apartmentCode,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      message:
        "Visitor entry created successfully. Flat owner has been notified.",
      data: {
        visitor: populatedVisitor,
        notificationSent: true,
      },
    });
  } catch (error) {
    console.error("Error creating visitor:", error);
    res.status(500).json({
      success: false,
      message: "Error creating visitor entry",
      error: error.message,
    });
  }
};

/**
 * @desc    Check-in visitor
 * @route   POST /api/visitors/:id/check-in
 * @access  Private (Admin, Staff)
 */
exports.checkInVisitor = async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;
    const { checkInMethod = "Manual" } = req.body;

    // Only admin and staff can check-in visitors
    if (role !== "admin" && role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Only admin and staff can check-in visitors",
      });
    }

    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (visitor.status === "Checked In") {
      return res.status(400).json({
        success: false,
        message: "Visitor is already checked in",
      });
    }

    if (visitor.status === "Checked Out") {
      return res.status(400).json({
        success: false,
        message: "Visitor has already checked out",
      });
    }

    // Update visitor
    visitor.status = "Checked In";
    visitor.checkInTime = new Date();
    visitor.checkInMethod = checkInMethod;
    visitor.checkedInBy = req.user._id;
    await visitor.save();

    // Populate and return
    const populatedVisitor = await Visitor.findById(visitor._id)
      .populate(
        "hostResident",
        "fullName phoneNumber wing flatNumber profilePicture fcmToken"
      )
      .populate("createdBy", "fullName role email phoneNumber")
      .populate("checkedInBy", "fullName role")
      .populate("checkedOutBy", "fullName role");

    // Get notification and email services
    const { sendUserNotification } = require("../services/notificationService");
    const { sendVisitorCheckInEmail } = require("../services/emailService");

    // IMPORTANT: Notify flat owner about check-in (REAL-TIME + EMAIL)
    if (populatedVisitor.hostResident && populatedVisitor.hostResident._id) {
      const hostResident = populatedVisitor.hostResident;
      const notificationData = {
        title: "Visitor Checked In",
        message: `${populatedVisitor.visitorName} has checked in at your flat ${hostResident.wing}-${hostResident.flatNumber}`,
        visitorId: visitor._id.toString(),
        visitorName: populatedVisitor.visitorName,
        flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
        checkInTime: visitor.checkInTime,
        timestamp: new Date(),
      };

      // Send real-time notification
      await sendUserNotification(
        hostResident._id.toString(),
        "visitor_checked_in",
        notificationData
      );

      // Send EMAIL notification (PROFESSIONAL - with exact timestamp)
      try {
        const emailResult = await sendVisitorCheckInEmail(hostResident, {
          visitorName: populatedVisitor.visitorName,
          phoneNumber: populatedVisitor.phoneNumber,
          visitorType: populatedVisitor.visitorType,
          flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
          checkInTime: visitor.checkInTime,
          checkInMethod: visitor.checkInMethod,
          visitorId: visitor._id.toString(),
        });
        if (emailResult.success) {
          console.log(
            `✅ [EMAIL] Visitor check-in email sent to ${hostResident.email}`
          );
        }
      } catch (emailError) {
        console.error(
          `❌ [EMAIL] Error sending visitor check-in email:`,
          emailError
        );
      }

      emitToUser(hostResident._id.toString(), "visitor_checked_in", {
        visitor: populatedVisitor,
        notification: notificationData,
      });

      console.log(
        `✅ [VISITOR] Notified flat owner about check-in: ${visitor._id}`
      );
    }

    // Emit socket event
    emitSocketEvent("visitor_checked_in", {
      visitor: populatedVisitor,
      apartmentCode: populatedVisitor.apartmentCode,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Visitor checked in successfully. Flat owner has been notified.",
      data: {
        visitor: populatedVisitor,
        notificationSent: true,
      },
    });
  } catch (error) {
    console.error("Error checking in visitor:", error);
    res.status(500).json({
      success: false,
      message: "Error checking in visitor",
      error: error.message,
    });
  }
};

/**
 * @desc    Check-out visitor
 * @route   POST /api/visitors/:id/check-out
 * @access  Private (Admin, Staff)
 */
exports.checkOutVisitor = async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;

    // Only admin and staff can check-out visitors
    if (role !== "admin" && role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Only admin and staff can check-out visitors",
      });
    }

    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    // Allow check-out if visitor has checkInTime (logged in) or status is Checked In
    if (visitor.status !== "Checked In" && !visitor.checkInTime) {
      return res.status(400).json({
        success: false,
        message: "Visitor is not checked in",
      });
    }

    // If visitor has checkInTime but status is not Checked In, update status
    if (visitor.checkInTime && visitor.status !== "Checked In") {
      visitor.status = "Checked In";
    }

    // Update visitor
    visitor.status = "Checked Out";
    visitor.checkOutTime = new Date();
    visitor.checkedOutBy = req.user._id;
    await visitor.save();

    // Populate and return
    const populatedVisitor = await Visitor.findById(visitor._id)
      .populate(
        "hostResident",
        "fullName phoneNumber wing flatNumber profilePicture fcmToken"
      )
      .populate("createdBy", "fullName role email phoneNumber")
      .populate("checkedInBy", "fullName role")
      .populate("checkedOutBy", "fullName role");

    // Get notification and email services
    const { sendUserNotification } = require("../services/notificationService");
    const { sendVisitorCheckOutEmail } = require("../services/emailService");

    // IMPORTANT: Notify flat owner about check-out (REAL-TIME + EMAIL)
    if (populatedVisitor.hostResident && populatedVisitor.hostResident._id) {
      const hostResident = populatedVisitor.hostResident;
      const notificationData = {
        title: "Visitor Checked Out",
        message: `${populatedVisitor.visitorName} has checked out from your flat ${hostResident.wing}-${hostResident.flatNumber}`,
        visitorId: visitor._id.toString(),
        visitorName: populatedVisitor.visitorName,
        flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
        checkOutTime: visitor.checkOutTime,
        timestamp: new Date(),
      };

      // Send real-time notification
      await sendUserNotification(
        hostResident._id.toString(),
        "visitor_checked_out",
        notificationData
      );

      // Send EMAIL notification (PROFESSIONAL - with exact timestamp and duration)
      try {
        const emailResult = await sendVisitorCheckOutEmail(hostResident, {
          visitorName: populatedVisitor.visitorName,
          phoneNumber: populatedVisitor.phoneNumber,
          visitorType: populatedVisitor.visitorType,
          flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
          checkOutTime: visitor.checkOutTime,
          checkInTime: populatedVisitor.checkInTime,
          visitorId: visitor._id.toString(),
        });
        if (emailResult.success) {
          console.log(
            `✅ [EMAIL] Visitor check-out email sent to ${hostResident.email}`
          );
        }
      } catch (emailError) {
        console.error(
          `❌ [EMAIL] Error sending visitor check-out email:`,
          emailError
        );
      }

      emitToUser(hostResident._id.toString(), "visitor_checked_out", {
        visitor: populatedVisitor,
        notification: notificationData,
      });

      console.log(
        `✅ [VISITOR] Notified flat owner about check-out: ${visitor._id}`
      );
    }

    // Emit socket event
    emitSocketEvent("visitor_checked_out", {
      visitor: populatedVisitor,
      apartmentCode: populatedVisitor.apartmentCode,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Visitor checked out successfully",
      data: { visitor: populatedVisitor },
    });
  } catch (error) {
    console.error("Error checking out visitor:", error);
    res.status(500).json({
      success: false,
      message: "Error checking out visitor",
      error: error.message,
    });
  }
};

/**
 * @desc    Get overdue visitors
 * @route   GET /api/visitors/overdue
 * @access  Private (Admin, Staff)
 */
exports.getOverdueVisitors = async (req, res) => {
  try {
    const { role, apartmentCode } = req.user;

    // Only admin and staff can view overdue visitors
    if (role !== "admin" && role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Only admin and staff can view overdue visitors",
      });
    }

    let query = {
      status: "Checked In",
      expectedCheckOutTime: { $lt: new Date() },
    };

    if (role === "staff") {
      query.apartmentCode = apartmentCode;
    }

    const visitors = await Visitor.find(query)
      .populate("hostResident", "fullName phoneNumber wing flatNumber")
      .sort({ expectedCheckOutTime: 1 });

    res.status(200).json({
      success: true,
      data: { visitors, count: visitors.length },
    });
  } catch (error) {
    console.error("Error getting overdue visitors:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching overdue visitors",
      error: error.message,
    });
  }
};

/**
 * @desc    Update visitor status (Approve/Reject/Cancel)
 * @route   PUT /api/visitors/:id/status
 * @access  Private (Admin, Staff)
 */
exports.updateVisitorStatus = async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;
    const { status, reason } = req.body;

    // Only admin and staff can update visitor status
    if (role !== "admin" && role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Only admin and staff can update visitor status",
      });
    }

    // Validate status
    const validStatuses = ["Pending", "Pre-Approved", "Rejected", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    // Don't allow status change if already checked in or checked out
    if (visitor.status === "Checked In" || visitor.status === "Checked Out") {
      return res.status(400).json({
        success: false,
        message: `Cannot change status. Visitor is already ${visitor.status}`,
      });
    }

    const oldStatus = visitor.status;

    // Update visitor status
    visitor.status = status;

    if (status === "Rejected") {
      visitor.rejectedBy = req.user._id;
      visitor.rejectedAt = new Date();
      visitor.rejectionReason = reason || "No reason provided";
    } else if (status === "Pre-Approved") {
      visitor.approvedBy = req.user._id;
      visitor.approvedAt = new Date();
    } else if (status === "Cancelled") {
      visitor.rejectedBy = req.user._id;
      visitor.rejectedAt = new Date();
      visitor.rejectionReason = reason || "Cancelled by staff";
    }

    await visitor.save();

    // Populate and return
    const populatedVisitor = await Visitor.findById(visitor._id)
      .populate(
        "hostResident",
        "fullName email phoneNumber wing flatNumber profilePicture fcmToken"
      )
      .populate("approvedBy", "fullName")
      .populate("rejectedBy", "fullName");

    // Get notification and email services
    const { sendUserNotification } = require("../services/notificationService");
    const {
      sendVisitorStatusUpdateEmail,
    } = require("../services/emailService");

    // Notify flat owner about status change
    if (populatedVisitor.hostResident && populatedVisitor.hostResident._id) {
      const hostResident = populatedVisitor.hostResident;
      const notificationData = {
        title: `Visitor Status Updated - ${status}`,
        message: `${visitor.visitorName}'s status has been changed from ${oldStatus} to ${status}`,
        visitorId: visitor._id.toString(),
        visitorName: visitor.visitorName,
        oldStatus: oldStatus,
        newStatus: status,
        flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
        timestamp: new Date(),
      };

      // Send real-time notification
      await sendUserNotification(
        hostResident._id.toString(),
        "visitor_status_updated",
        notificationData
      );

      // Send email notification if available
      if (hostResident.email) {
        try {
          const emailResult = await sendVisitorStatusUpdateEmail(hostResident, {
            visitorName: visitor.visitorName,
            phoneNumber: visitor.phoneNumber,
            visitorType: visitor.visitorType,
            flatNumber: `${hostResident.wing}-${hostResident.flatNumber}`,
            oldStatus: oldStatus,
            newStatus: status,
            reason: reason,
            visitorId: visitor._id.toString(),
          });
          if (emailResult.success) {
            console.log(
              `✅ [EMAIL] Visitor status update email sent to ${hostResident.email}`
            );
          }
        } catch (emailError) {
          console.error(
            `❌ [EMAIL] Error sending status update email:`,
            emailError
          );
        }
      }

      emitToUser(hostResident._id.toString(), "visitor_status_updated", {
        visitor: populatedVisitor,
        notification: notificationData,
      });
    }

    // Emit socket event
    emitSocketEvent("visitor_status_updated", {
      visitor: populatedVisitor,
      oldStatus: oldStatus,
      newStatus: status,
      apartmentCode: populatedVisitor.apartmentCode,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: `Visitor status updated to ${status} successfully`,
      data: {
        visitor: populatedVisitor,
        oldStatus: oldStatus,
        newStatus: status,
      },
    });
  } catch (error) {
    console.error("Error updating visitor status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating visitor status",
      error: error.message,
    });
  }
};

/**
 * @desc    Set exact time for visitor entry
 * @route   PUT /api/visitors/:id/exact-time
 * @access  Private (Admin, Staff)
 */
exports.setExactTime = async (req, res) => {
  try {
    const { role } = req.user;
    const { id } = req.params;

    // Only admin and staff can set exact time
    if (role !== "admin" && role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Only admin and staff can set exact time",
      });
    }

    const visitor = await Visitor.findById(id);
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    // Set exact time to current time
    visitor.exactTime = new Date();
    await visitor.save();

    // Populate and return
    const populatedVisitor = await Visitor.findById(visitor._id)
      .populate("hostResident", "fullName email phoneNumber wing flatNumber")
      .populate("createdBy", "fullName role email phoneNumber")
      .populate("checkedInBy", "fullName role")
      .populate("checkedOutBy", "fullName role");

    // Emit socket event
    emitSocketEvent("visitor_exact_time_set", {
      visitor: populatedVisitor,
      exactTime: visitor.exactTime,
      apartmentCode: populatedVisitor.apartmentCode,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Exact time set successfully",
      data: {
        visitor: populatedVisitor,
        exactTime: visitor.exactTime,
      },
    });
  } catch (error) {
    console.error("Error setting exact time:", error);
    res.status(500).json({
      success: false,
      message: "Error setting exact time",
      error: error.message,
    });
  }
};

/**
 * @desc    Get visitor dashboard statistics
 * @route   GET /api/visitors/dashboard/stats
 * @access  Private (Admin, Staff, Resident)
 */
exports.getVisitorStats = async (req, res) => {
  try {
    const { role, _id, apartmentCode, wing, flatNumber } = req.user;

    let query = {};

    // Role-based filtering
    if (role === "resident") {
      query.hostResident = _id;
      query.apartmentCode = apartmentCode;
    } else if (role === "staff") {
      query.apartmentCode = apartmentCode;
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      visitorsToday: await Visitor.countDocuments({
        ...query,
        entryDate: { $gte: today, $lt: tomorrow },
      }),
      currentlyInside: await Visitor.countDocuments({
        ...query,
        status: "Checked In",
      }),
      overstayAlert: await Visitor.countDocuments({
        ...query,
        status: "Checked In",
        expectedCheckOutTime: { $lt: new Date() },
      }),
      pending: await Visitor.countDocuments({
        ...query,
        status: "Pending",
      }),
    };

    res.status(200).json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    console.error("Error getting visitor stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching visitor statistics",
      error: error.message,
    });
  }
};
