const mongoose = require("mongoose");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const Staff = require("../models/Staff");
const Notice = require("../models/Notice");
const Apartment = require("../models/Apartment");
const { emitToUser, emitToRoom } = require("../services/socketService");

// @desc    Get all buildings for admin
// @route   GET /api/admin/buildings
// @access  Private (Admin)
const getAllBuildings = async (req, res) => {
  try {
    const adminId = req.user.id;
    console.log("🏢 [ADMIN] Get all buildings request");
    console.log("🏢 [ADMIN] Admin ID:", adminId, "Type:", typeof adminId);
    
    const admin = await User.findById(adminId);

    if (!admin) {
      console.log("❌ [ADMIN] Admin not found");
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    console.log("✅ [ADMIN] Admin found:", admin.fullName, "Role:", admin.role);

    // Ensure adminId is ObjectId for proper query
    // adminId from req.user.id should already be ObjectId, but ensure it's properly formatted
    let adminObjectId = adminId;
    
    // Convert to ObjectId if it's a string
    if (typeof adminId === 'string' && mongoose.Types.ObjectId.isValid(adminId)) {
      adminObjectId = new mongoose.Types.ObjectId(adminId);
    } else if (adminId && adminId.toString) {
      // If it's already an ObjectId, use it as is
      adminObjectId = adminId;
    }

    console.log("🔍 [ADMIN] Querying buildings for admin:", adminObjectId);

    // Get all buildings created by this admin
    const buildings = await Apartment.find({
      createdBy: adminObjectId,
      isActive: true,
    })
      .select(
        "name code address buildingCategory buildingType configuration.totalFloors configuration.flatsPerFloor createdAt createdBy"
      )
      .sort({ createdAt: -1 });

    console.log(`✅ [ADMIN] Found ${buildings.length} buildings for admin ${adminId}`);
    
    // Log building details for debugging
    buildings.forEach((building, index) => {
      console.log(`  Building ${index + 1}: ${building.name} (${building.code}) - CreatedBy: ${building.createdBy}`);
    });

    // Get statistics for each building
    const buildingsWithStats = await Promise.all(
      buildings.map(async (building) => {
        const totalFlats =
          building.configuration.totalFloors *
          building.configuration.flatsPerFloor;
        const occupiedCount = await User.countDocuments({
          apartmentCode: building.code,
          role: "resident",
          status: "active",
        });
        const vacantCount = totalFlats - occupiedCount;
        const occupancyRate =
          totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0;

        return {
          id: building._id,
          name: building.name,
          code: building.code,
          buildingCategory: building.buildingCategory,
          buildingType: building.buildingType,
          address: building.address,
          totalFloors: building.configuration.totalFloors,
          flatsPerFloor: building.configuration.flatsPerFloor,
          totalFlats,
          occupiedFlats: occupiedCount,
          vacantFlats: vacantCount,
          occupancyRate: parseFloat(occupancyRate),
          createdAt: building.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        buildings: buildingsWithStats,
        totalBuildings: buildingsWithStats.length,
      },
    });
  } catch (error) {
    console.error("Get all buildings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching buildings",
    });
  }
};

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
const getAdminDashboard = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { buildingCode } = req.query; // Get building code from query params

    // Get admin
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // If buildingCode is provided, use it; otherwise get first building
    let apartmentCode = buildingCode;
    if (!apartmentCode) {
      // Get first building created by admin
      const firstBuilding = await Apartment.findOne({
        createdBy: adminId,
        isActive: true,
      })
        .select("code")
        .sort({ createdAt: 1 });
      if (firstBuilding) {
        apartmentCode = firstBuilding.code;
      } else {
        return res.status(200).json({
          success: true,
          data: {
            dashboard: {
              pendingApprovals: 0,
              totalComplaints: 0,
              activeComplaints: 0,
              resolvedComplaints: 0,
              staffPerformance: [],
              recentActivities: [],
              building: {
                totalFlats: 0,
                occupiedFlats: 0,
                vacantFlats: 0,
                occupancyRate: 0,
              },
              residents: { total: 0, active: 0 },
              staff: { total: 0, active: 0 },
            },
            buildings: [],
          },
        });
      }
    }

    // Verify building belongs to admin
    const building = await Apartment.findOne({
      code: apartmentCode,
      createdBy: adminId,
      isActive: true,
    });
    if (!building) {
      return res.status(403).json({
        success: false,
        message: "Building not found or access denied",
      });
    }

    // Get pending user approvals
    const pendingUsers = await User.countDocuments({
      apartmentCode,
      status: "pending",
      role: "resident",
    });

    // Get complaint statistics
    const complaintStats = await Complaint.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $match: {
          "user.apartmentCode": apartmentCode,
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get staff performance
    const staffPerformance = await Staff.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $match: {
          "user.apartmentCode": apartmentCode,
          isActive: true,
        },
      },
      {
        $project: {
          "user.fullName": 1,
          "user.profilePicture": 1,
          performance: 1,
          currentWorkload: 1,
          specialization: 1,
        },
      },
    ]);

    // Get recent activities
    const recentComplaints = await Complaint.find()
      .populate({
        path: "createdBy",
        match: { apartmentCode: apartmentCode },
        select: "fullName wing flatNumber",
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .then((complaints) => complaints.filter((comp) => comp.createdBy)); // Filter by apartment

    // Get building details for comprehensive statistics
    // Note: building is already fetched above at line 127
    let buildingStats = {
      totalFlats: 0,
      occupiedFlats: 0,
      vacantFlats: 0,
      occupancyRate: 0,
    };

    if (building) {
      const totalFlats =
        building.configuration.totalFloors *
        building.configuration.flatsPerFloor;
      const occupiedCount = await User.countDocuments({
        apartmentCode,
        role: "resident",
        status: "active",
      });
      const vacantCount = totalFlats - occupiedCount;
      const occupancyRate =
        totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0;

      buildingStats = {
        totalFlats,
        occupiedFlats: occupiedCount,
        vacantFlats: vacantCount,
        occupancyRate: parseFloat(occupancyRate),
        totalFloors: building.configuration.totalFloors,
        flatsPerFloor: building.configuration.flatsPerFloor,
      };
    }

    // Get total residents and staff
    const totalResidents = await User.countDocuments({
      apartmentCode,
      role: "resident",
      status: "active",
    });

    const totalStaff = await User.countDocuments({
      apartmentCode,
      role: "staff",
      status: "active",
    });

    // Transform complaint stats
    const stats = complaintStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const totalComplaints = Object.values(stats).reduce((a, b) => a + b, 0);
    const activeComplaints =
      (stats.Open || 0) + (stats.Assigned || 0) + (stats["In Progress"] || 0);
    const resolvedComplaints = (stats.Resolved || 0) + (stats.Closed || 0);

    res.status(200).json({
      success: true,
      data: {
        dashboard: {
          pendingApprovals: pendingUsers,
          totalComplaints,
          activeComplaints,
          resolvedComplaints,
          staffPerformance,
          recentActivities: recentComplaints,
          building: buildingStats,
          residents: {
            total: totalResidents,
            active: totalResidents,
          },
          staff: {
            total: totalStaff,
            active: totalStaff,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get admin dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin dashboard",
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
        message: "Admin not found",
      });
    }

    const pendingUsers = await User.find({
      apartmentCode: apartmentCode,
      status: "pending",
      role: "resident",
    }).select("-password");

    res.status(200).json({
      success: true,
      data: { pendingUsers },
    });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending approvals",
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
        message: "User not found",
      });
    }

    // Check if admin has permission for this apartment
    const admin = await User.findById(adminId);
    if (user.apartmentCode !== admin.apartmentCode) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to manage users from this apartment",
      });
    }

    let updateData = {};
    let message = "";

    if (action === "approve") {
      updateData = { status: "active" };
      message = "User approved successfully";

      // Notify user about approval
      emitToUser(userId, "user_approved", {
        message: "Your account has been approved by admin",
        timestamp: new Date(),
      });
    } else if (action === "reject") {
      updateData = { status: "rejected" };
      message = "User rejected successfully";

      // Notify user about rejection
      emitToUser(userId, "user_rejected", {
        message: "Your account registration has been rejected",
        reason: reason || "No reason provided",
        timestamp: new Date(),
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    // Broadcast to admin room
    emitToRoom("admin", "user_approval_updated", {
      userId,
      action,
      updatedBy: adminId,
    });

    res.status(200).json({
      success: true,
      message,
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Update user approval error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user approval",
    });
  }
};

// @desc    Get all complaints for admin
// @route   GET /api/admin/complaints
// @access  Private (Admin)
const getAllComplaints = async (req, res) => {
  try {
    const adminId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      category,
      priority,
      wing,
      buildingCode,
      createdBy, // Optional: Filter by specific resident ID
    } = req.query;

    // Get admin user
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Build filter
    const filter = {};

    // Get all buildings created by this admin
    let apartmentCode = buildingCode;
    let buildingCodes = [];

    if (apartmentCode) {
      // Verify building belongs to admin
      const building = await Apartment.findOne({
        code: apartmentCode,
        createdBy: adminId,
        isActive: true,
      });
      if (!building) {
        return res.status(404).json({
          success: false,
          message: "Building not found or access denied",
        });
      }
      buildingCodes = [apartmentCode];
    } else {
      // Get all buildings created by admin
      const adminBuildings = await Apartment.find({
        createdBy: adminId,
        isActive: true,
      }).select("code");
      buildingCodes = adminBuildings.map((b) => b.code);
      
      if (buildingCodes.length === 0) {
        // No buildings found - return empty result
        return res.status(200).json({
          success: true,
          data: {
            complaints: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }
    }

    // Filter by apartment through user lookup
    const userFilter = { apartmentCode: { $in: buildingCodes } };
    if (wing) userFilter.wing = wing;

    // Get users from the admin's buildings
    const apartmentUsers = await User.find(userFilter).select("_id");
    let userIds = apartmentUsers.map((user) => user._id);

    // If createdBy is specified, filter to that specific user (if they belong to admin's buildings)
    if (createdBy) {
      // Convert userIds to strings for comparison
      const userIdStrings = userIds.map(id => id.toString());
      if (userIdStrings.includes(createdBy)) {
        // The specified user belongs to admin's buildings, filter to just that user
        userIds = [createdBy];
      } else {
        // The specified user doesn't belong to admin's buildings, return empty
        return res.status(200).json({
          success: true,
          data: {
            complaints: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }
    }

    if (userIds.length === 0) {
      // No users found in admin's buildings
      return res.status(200).json({
        success: true,
        data: {
          complaints: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
          },
        },
      });
    }

    filter.createdBy = { $in: userIds };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate(
        "createdBy",
        "fullName phoneNumber wing flatNumber profilePicture apartmentCode"
      )
      .populate("assignedTo.staff", "user")
      .populate({
        path: "assignedTo.staff",
        populate: { path: "user", select: "fullName phoneNumber" },
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
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all complaints error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching complaints",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
        message: "Complaint not found",
      });
    }

    // Get staff
    const staff = await Staff.findById(staffId).populate("user");
    if (!staff || !staff.isActive) {
      return res.status(404).json({
        success: false,
        message: "Staff not found or inactive",
      });
    }

    // Check if staff is available
    if (!staff.isAvailable()) {
      return res.status(400).json({
        success: false,
        message: "Staff is currently at full capacity",
      });
    }

    // Assign complaint
    complaint.assignedTo = {
      staff: staffId,
      assignedAt: new Date(),
      assignedBy: adminId,
    };

    // Update status and timeline
    await complaint.updateStatus(
      "Assigned",
      `Complaint assigned to ${staff.user.fullName}`,
      adminId
    );

    // Update staff workload
    staff.currentWorkload.activeComplaints += 1;
    await staff.save();

    // Populate for response
    await complaint.populate("assignedTo.staff", "user");
    await complaint.populate({
      path: "assignedTo.staff",
      populate: { path: "user", select: "fullName phoneNumber profilePicture" },
    });

    // Notify staff about assignment
    emitToUser(staff.user._id.toString(), "complaint_assigned", {
      message: "New complaint assigned to you",
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority,
        location: complaint.location,
      },
    });

    // Notify user about assignment
    emitToUser(complaint.createdBy.toString(), "complaint_assigned", {
      message: "Your complaint has been assigned to staff",
      complaint: {
        id: complaint._id,
        ticketNumber: complaint.ticketNumber,
        title: complaint.title,
      },
      staff: {
        name: staff.user.fullName,
        phone: staff.user.phoneNumber,
      },
    });

    res.status(200).json({
      success: true,
      message: "Complaint assigned successfully",
      data: { complaint },
    });
  } catch (error) {
    console.error("Assign complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning complaint",
    });
  }
};

// @desc    Get all staff members
// @route   GET /api/admin/staff
// @access  Private (Admin)
const getAllStaff = async (req, res) => {
  try {
    const adminId = req.user.id;
    console.log("👥 [ADMIN] Get all staff request");
    console.log("👥 [ADMIN] Admin ID:", adminId);

    // Get admin
    const admin = await User.findById(adminId);
    if (!admin) {
      console.log("❌ [ADMIN] Admin not found");
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Get all buildings created by this admin
    const buildings = await Apartment.find({
      createdBy: adminId,
      isActive: true,
    }).select("code");

    const buildingCodes = buildings.map((b) => b.code);
    console.log(`✅ [ADMIN] Found ${buildingCodes.length} buildings:`, buildingCodes);

    if (buildingCodes.length === 0) {
      console.log("ℹ️ [ADMIN] No buildings found for admin");
      return res.status(200).json({
        success: true,
        data: { staff: [] },
      });
    }

    // Get all staff from admin's buildings
    const staff = await Staff.find()
      .populate({
        path: "user",
        match: { apartmentCode: { $in: buildingCodes } },
        select: "fullName phoneNumber email profilePicture apartmentCode",
      })
      .then((staff) => staff.filter((s) => s.user)); // Filter by apartment

    console.log(`✅ [ADMIN] Found ${staff.length} staff members`);

    res.status(200).json({
      success: true,
      data: { staff },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Get all staff error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching staff members",
    });
  }
};

// @desc    Create building/apartment (for admin after login)
// @route   POST /api/admin/buildings
// @access  Private (Admin)
const createBuilding = async (req, res) => {
  try {
    console.log("🏢 [ADMIN] Create building request received");
    console.log("🏢 [ADMIN] Request body:", JSON.stringify(req.body, null, 2));

    const adminId = req.user.id;
    const admin = await User.findById(adminId);

    if (!admin) {
      console.log("❌ [ADMIN] Admin not found");
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Support multiple admins: Each admin can create multiple buildings
    // Buildings are linked to admins via createdBy field
    // No restriction on number of buildings per admin

    const {
      name,
      code,
      address,
      contact,
      settings,
      totalFloors,
      flatsPerFloor,
      // New comprehensive fields
      buildingCategory,
      buildingType,
      structuralDetails,
      safetyCompliance,
      utilities,
      parking,
      amenities,
    } = req.body;

    // Validate required fields
    if (!name || !code || !address) {
      console.log("❌ [ADMIN] Missing required fields");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: name, code, and address are required",
      });
    }

    // Validate floors and flats configuration
    const numFloors = parseInt(totalFloors) || 5;
    const numFlatsPerFloor = parseInt(flatsPerFloor) || 4;

    if (numFloors < 1 || numFloors > 100) {
      return res.status(400).json({
        success: false,
        message: "Total floors must be between 1 and 100",
      });
    }

    if (numFlatsPerFloor < 1 || numFlatsPerFloor > 50) {
      return res.status(400).json({
        success: false,
        message: "Flats per floor must be between 1 and 50",
      });
    }

    // Check if building code already exists
    const existingBuilding = await Apartment.findByCode(code);
    if (existingBuilding) {
      console.log("❌ [ADMIN] Building code already exists:", code);
      return res.status(409).json({
        success: false,
        message: "Building with this code already exists",
      });
    }

    console.log("📋 [ADMIN] Creating building dynamically...");
    console.log("📋 [ADMIN] Building configuration:");
    console.log(`  - Total Floors: ${numFloors}`);
    console.log(`  - Flats per Floor: ${numFlatsPerFloor}`);
    console.log(`  - Total Flats: ${numFloors * numFlatsPerFloor}`);

    // Generate building code prefix from building name
    const buildingPrefix = name
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 6)
      .toUpperCase();

    // Create floors with flats dynamically
    const floors = [];
    const flatTypes = ["1BHK", "2BHK", "3BHK", "4BHK"];

    for (let floorNum = 1; floorNum <= numFloors; floorNum++) {
      const flats = [];
      for (let flatNum = 1; flatNum <= numFlatsPerFloor; flatNum++) {
        // Format: Floor 1 -> 101, 102, 103, 104; Floor 2 -> 201, 202, etc.
        const flatNumber = `${floorNum}${String(flatNum).padStart(2, "0")}`;
        const flatType = flatTypes[(flatNum - 1) % 4]; // Rotate flat types

        // Generate FlatCode: BuildingPrefix-FloorNumber-FlatNumber
        // Example: SUNSHI-1-01, SUNSHI-2-03
        const flatCode = `${buildingPrefix}-${floorNum}-${String(
          flatNum
        ).padStart(2, "0")}`;

        flats.push({
          flatNumber: flatNumber,
          flatCode: flatCode,
          flatType: flatType,
          isOccupied: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `  ✓ Floor ${floorNum}, Flat ${flatNumber} (${flatCode}) - ${flatType}`
        );
      }
      floors.push({
        floorNumber: floorNum,
        flats: flats,
      });
    }

    console.log(
      `✅ [ADMIN] Created ${floors.length} floors with ${floors[0].flats.length} flats each`
    );
    console.log(
      `✅ [ADMIN] Total flats created: ${
        floors.length * floors[0].flats.length
      }`
    );

    // Calculate building age if completion date is provided
    let buildingAge = null;
    if (structuralDetails?.constructionCompletionDate) {
      const completionDate = new Date(
        structuralDetails.constructionCompletionDate
      );
      const today = new Date();
      buildingAge = Math.floor(
        (today - completionDate) / (1000 * 60 * 60 * 24 * 365)
      );
    }

    // Create building with comprehensive fields
    const building = await Apartment.create({
      name,
      code: code.toUpperCase(),
      buildingCategory: buildingCategory || "Residential",
      buildingType: buildingType || "Apartment",
      address,
      contact: contact || {},
      structuralDetails: structuralDetails
        ? {
            ...structuralDetails,
            buildingAge: buildingAge,
          }
        : {},
      safetyCompliance: safetyCompliance || {},
      utilities: utilities || {},
      parking: parking || {},
      amenities: amenities || [],
      configuration: {
        totalFloors: numFloors,
        flatsPerFloor: numFlatsPerFloor,
        floors: floors,
      },
      settings: settings || {
        maintenanceRate: 0,
        lateFeePercentage: 2,
        gracePeriod: 15,
      },
      createdBy: adminId,
      isActive: true,
    });

    console.log(`✅ [ADMIN] Building created: ${building._id}`);
    console.log(`✅ [ADMIN] Building createdBy: ${building.createdBy} (Type: ${typeof building.createdBy})`);
    console.log(`✅ [ADMIN] Admin ID: ${adminId} (Type: ${typeof adminId})`);

    // Activate admin account if not already active
    // Also set apartmentCode to first building if not already set
    let adminUpdated = false;
    if (admin.status !== "active") {
      admin.status = "active";
      adminUpdated = true;
      console.log(`✅ [ADMIN] Admin account activated`);
    }

    // Set admin's apartmentCode to this building if they don't have one yet
    // This helps with operations that reference admin.apartmentCode
    // Note: Admins can create multiple buildings, but we set apartmentCode to their first building
    if (!admin.apartmentCode) {
      admin.apartmentCode = building.code.toUpperCase();
      adminUpdated = true;
      console.log(`✅ [ADMIN] Set admin apartmentCode to: ${building.code}`);
    }

    // Save admin if any updates were made
    if (adminUpdated) {
      await admin.save();
      console.log(`✅ [ADMIN] Admin profile updated`);
    }

    console.log("📡 [ADMIN] Emitting real-time events for building creation");

    // Emit real-time event to admin
    emitToUser(adminId.toString(), "building_created", {
      message: "Building created successfully",
      building: {
        id: building._id,
        name: building.name,
        code: building.code,
        totalFloors: building.configuration.totalFloors,
        flatsPerFloor: building.configuration.flatsPerFloor,
      },
    });
    console.log(`📡 [ADMIN] Notified admin ${adminId} about building creation`);

    // Broadcast to apartment room
    emitToRoom(`apartment_${building.code}`, "building_created", {
      message: "Building created",
      building: {
        id: building._id,
        name: building.name,
        code: building.code,
      },
    });
    console.log(
      `📡 [ADMIN] Broadcasted building creation to apartment ${building.code}`
    );

    console.log("📊 [ADMIN] Building creation summary:");
    console.log(`  - Building Name: ${building.name}`);
    console.log(`  - Building Code: ${building.code}`);
    console.log(`  - Total Floors: ${building.configuration.totalFloors}`);
    console.log(`  - Flats per Floor: ${building.configuration.flatsPerFloor}`);
    console.log(
      `  - Total Flats: ${
        building.configuration.totalFloors *
        building.configuration.flatsPerFloor
      }`
    );
    console.log(`  - All Flats Created Dynamically: ✅`);

    res.status(201).json({
      success: true,
      message: `Building created successfully with ${numFloors} floors and ${numFlatsPerFloor} flats per floor`,
      data: {
        building: {
          ...building.toObject(),
          summary: {
            totalFloors: building.configuration.totalFloors,
            flatsPerFloor: building.configuration.flatsPerFloor,
            totalFlats:
              building.configuration.totalFloors *
              building.configuration.flatsPerFloor,
            floors: building.configuration.floors.map((floor) => ({
              floorNumber: floor.floorNumber,
              totalFlats: floor.flats.length,
              flats: floor.flats.map((flat) => ({
                flatNumber: flat.flatNumber,
                flatType: flat.flatType,
                isOccupied: flat.isOccupied,
              })),
            })),
          },
        },
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Create building error:", error);
    console.error("❌ [ADMIN] Error stack:", error.stack);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Building with this name or code already exists",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((err) => err.message)
        .join(", ");
      return res.status(400).json({
        success: false,
        message: messages,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating building",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Create user (resident or staff) - Admin only
// @route   POST /api/admin/users
// @access  Private (Admin)
const createUser = async (req, res) => {
  try {
    console.log("👤 [ADMIN] Create user request received");
    console.log(
      "👤 [ADMIN] Request body:",
      JSON.stringify({ ...req.body, password: "***" }, null, 2)
    );

    const adminId = req.user.id;
    const admin = await User.findById(adminId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create users",
      });
    }

    const {
      fullName,
      phoneNumber,
      email,
      password,
      role,
      floorNumber,
      flatNumber,
      flatType,
      buildingCode,
    } = req.body;

    // If buildingCode is provided, use it; otherwise get first building
    let apartmentCode = buildingCode;
    if (!apartmentCode) {
      const firstBuilding = await Apartment.findOne({
        createdBy: adminId,
        isActive: true,
      })
        .select("code")
        .sort({ createdAt: 1 });
      if (firstBuilding) {
        apartmentCode = firstBuilding.code;
      } else {
        return res.status(404).json({
          success: false,
          message: "No building found. Please create a building first.",
        });
      }
    }

    // Verify building belongs to admin
    const building = await Apartment.findOne({
      code: apartmentCode,
      createdBy: adminId,
      isActive: true,
    });
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found or access denied",
      });
    }

    // Validate required fields
    if (!fullName || !phoneNumber || !password || !role) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: fullName, phoneNumber, password, and role are required",
      });
    }

    // Validate role
    if (!["resident", "staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be resident or staff",
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Indian phone number",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this phone number",
      });
    }

    // For residents, validate flat assignment
    if (role === "resident") {
      if (!floorNumber || !flatNumber || !flatType) {
        return res.status(400).json({
          success: false,
          message:
            "For residents, floorNumber, flatNumber, and flatType are required",
        });
      }

      // Check if flat exists
      if (!building.flatExists(floorNumber, flatNumber)) {
        return res.status(400).json({
          success: false,
          message: `Flat ${flatNumber} not found on floor ${floorNumber}`,
        });
      }

      // Check if flat is already occupied
      const flatDetails = building.getFlatDetails(floorNumber, flatNumber);
      if (flatDetails && flatDetails.isOccupied) {
        return res.status(409).json({
          success: false,
          message: `Flat ${flatNumber} on floor ${floorNumber} is already occupied`,
        });
      }

      // Check if another resident already has this flat
      const existingResident = await User.findOne({
        apartmentCode: apartmentCode,
        floorNumber: parseInt(floorNumber),
        flatNumber: flatNumber.toUpperCase(),
        role: "resident",
        status: "active",
      });

      if (existingResident) {
        return res.status(409).json({
          success: false,
          message: "This flat already has an active resident",
        });
      }
    }

    // Create user
    const userData = {
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      password: String(password),
      role,
      apartmentCode: apartmentCode,
      status: "active", // Admin-created users are auto-active
      isVerified: true,
    };

    // Add flat details for residents
    if (role === "resident") {
      // Convert floorNumber to integer (handle both string and number)
      const floorNum =
        typeof floorNumber === "string" ? parseInt(floorNumber) : floorNumber;

      // Get flat details to retrieve flatCode
      const flatDetails = building.getFlatDetails(
        floorNum,
        flatNumber.toUpperCase()
      );
      let flatCode = "";

      if (flatDetails && flatDetails.flatCode) {
        flatCode = flatDetails.flatCode;
      } else {
        // Generate flatCode if not found in building
        const buildingPrefix = building.name
          .replace(/[^a-zA-Z0-9]/g, "")
          .substring(0, 6)
          .toUpperCase();
        const flatNumStr = flatNumber.replace(/[^0-9]/g, "");
        flatCode = `${buildingPrefix}-${floorNum}-${flatNumStr.padStart(
          2,
          "0"
        )}`;
      }

      console.log("🏠 [ADMIN] Setting user flat details:");
      console.log("  - floorNumber:", floorNum, "(type:", typeof floorNum, ")");
      console.log("  - flatNumber:", flatNumber.toUpperCase());
      console.log("  - flatCode:", flatCode);
      console.log("  - flatType:", flatType);

      userData.floorNumber = floorNum;
      userData.flatNumber = flatNumber.toUpperCase();
      userData.flatCode = flatCode.toUpperCase();
      userData.flatType = flatType;
      userData.wing = "A"; // Default wing, can be customized later
      userData.registeredAt = new Date();
      userData.lastUpdatedAt = new Date();
    }

    const user = await User.create(userData);

    // Mark flat as occupied if resident
    if (role === "resident") {
      const floorNum =
        typeof floorNumber === "string" ? parseInt(floorNumber) : floorNumber;
      console.log(
        "🏠 [ADMIN] Marking flat as occupied: Floor",
        floorNum,
        "Flat",
        flatNumber
      );
      building.markFlatOccupied(floorNum, flatNumber.toUpperCase(), user._id);
      await building.save();
      console.log("✅ [ADMIN] Flat marked as occupied successfully");

      // Emit real-time event for flat status update
      emitToRoom(`apartment_${apartmentCode}`, "flat_status_updated", {
        message: "Flat status updated",
        buildingCode: apartmentCode,
        flat: {
          floorNumber: floorNum,
          flatNumber: flatNumber.toUpperCase(),
          flatCode: user.flatCode,
          isOccupied: true,
          occupiedBy: {
            userId: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
          },
        },
        timestamp: new Date(),
      });
      console.log(
        `📡 [ADMIN] Broadcasted flat status update to apartment ${apartmentCode}`
      );
    }

    console.log(`✅ [ADMIN] User created: ${user._id}`);

    // Emit real-time events
    console.log("📡 [ADMIN] Emitting real-time events for user creation");

    // Notify admin
    emitToUser(adminId.toString(), "user_created", {
      message: `${role} account created successfully`,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    });
    console.log(`📡 [ADMIN] Notified admin ${adminId} about user creation`);

    // Broadcast to apartment room for real-time updates
    emitToRoom(`apartment_${apartmentCode}`, "user_created", {
      message: "New user created",
      buildingCode: apartmentCode,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
      timestamp: new Date(),
    });
    console.log(
      `📡 [ADMIN] Broadcasted user creation to apartment ${apartmentCode}`
    );

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          role: user.role,
          apartmentCode: user.apartmentCode,
          floorNumber: user.floorNumber,
          flatNumber: user.flatNumber,
          flatType: user.flatType,
          status: user.status,
        },
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Create user error:", error);
    console.error("❌ [ADMIN] Error stack:", error.stack);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this phone number or email",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((err) => err.message)
        .join(", ");
      return res.status(400).json({
        success: false,
        message: messages,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Get all users (residents and staff) - Admin only
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { buildingCode, role, status } = req.query;
    const admin = await User.findById(adminId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // If buildingCode is provided, use it; otherwise get all buildings for admin
    let apartmentCode = buildingCode;
    let filter = {
      role: { $ne: "admin" }, // Exclude admins
    };

    if (apartmentCode) {
      // Verify building belongs to admin
      const building = await Apartment.findOne({
        code: apartmentCode,
        createdBy: adminId,
        isActive: true,
      });
      if (!building) {
        return res.status(404).json({
          success: false,
          message: "Building not found or access denied",
        });
      }
      filter.apartmentCode = apartmentCode;
    } else {
      // Get all buildings created by admin
      const adminBuildings = await Apartment.find({
        createdBy: adminId,
        isActive: true,
      }).select("code");
      const buildingCodes = adminBuildings.map((b) => b.code);
      if (buildingCodes.length > 0) {
        filter.apartmentCode = { $in: buildingCodes };
      } else {
        // No buildings found
        return res.status(200).json({
          success: true,
          data: {
            users: [],
            total: 0,
          },
        });
      }
    }

    if (role) filter.role = role;
    if (status) filter.status = status;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

    // Get statistics
    const residents = users.filter((u) => u.role === "resident").length;
    const staff = users.filter((u) => u.role === "staff").length;
    const active = users.filter((u) => u.status === "active").length;
    const inactive = users.filter((u) => u.status !== "active").length;

    res.status(200).json({
      success: true,
      data: {
        users,
        total: users.length,
        statistics: {
          residents,
          staff,
          active,
          inactive,
        },
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
    });
  }
};

// @desc    Get residents with advanced filtering and risk detection
// @route   GET /api/admin/residents
// @access  Private (Admin)
const getResidentsAdvanced = async (req, res) => {
  try {
    const adminId = req.user.id;
    const {
      buildingCode,
      search,
      status,
      floor,
      paymentStatus,
      complaintStatus,
      verificationStatus,
      riskLevel,
      page = 1,
      limit = 50,
    } = req.query;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Build filter
    let apartmentCode = buildingCode;
    let filter = { role: "resident" };

    // Building filter
    if (apartmentCode) {
      const building = await Apartment.findOne({
        code: apartmentCode,
        createdBy: adminId,
        isActive: true,
      });
      if (!building) {
        return res.status(404).json({
          success: false,
          message: "Building not found or access denied",
        });
      }
      filter.apartmentCode = apartmentCode;
    } else {
      const adminBuildings = await Apartment.find({
        createdBy: adminId,
        isActive: true,
      }).select("code");
      const buildingCodes = adminBuildings.map((b) => b.code);
      if (buildingCodes.length > 0) {
        filter.apartmentCode = { $in: buildingCodes };
      } else {
        return res.status(200).json({
          success: true,
          data: { residents: [], total: 0, statistics: {} },
        });
      }
    }

    // Status filter
    if (status) filter.status = status;

    // Floor filter
    if (floor) filter.floorNumber = parseInt(floor);

    // Search filter
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { flatNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Get residents
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const residents = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get complaints for risk detection
    const Complaint = require("../models/Complaint");
    const residentIds = residents.map((r) => r._id);
    const activeComplaints = await Complaint.find({
      createdBy: { $in: residentIds },
      status: { $in: ["Open", "Assigned", "In Progress", "Reopened"] },
    }).populate("createdBy", "fullName");

    // Build complaints map
    const complaintsMap = {};
    activeComplaints.forEach((c) => {
      const userId = c.createdBy._id.toString();
      if (!complaintsMap[userId]) {
        complaintsMap[userId] = [];
      }
      complaintsMap[userId].push({
        id: c._id,
        status: c.status,
        priority: c.priority,
        category: c.category,
      });
    });

    // Enhance residents with risk data
    const enhancedResidents = residents.map((resident) => {
      const residentObj = resident.toObject();
      const complaints = complaintsMap[resident._id.toString()] || [];
      const hasActiveComplaints = complaints.length > 0;
      const hasHighPriorityComplaints = complaints.some(
        (c) => c.priority === "High" || c.priority === "Emergency"
      );

      // Calculate risk level
      let riskLevel = "low";
      const riskFactors = [];

      if (resident.status === "pending") riskFactors.push("pending_approval");
      if (resident.status === "suspended") riskFactors.push("suspended");
      if (hasActiveComplaints) riskFactors.push("active_complaints");
      if (hasHighPriorityComplaints) riskFactors.push("high_priority_complaints");
      // TODO: Add payment overdue detection when Payment model is implemented
      // if (hasOverduePayments) riskFactors.push("overdue_payments");

      if (riskFactors.length >= 3) riskLevel = "high";
      else if (riskFactors.length >= 1) riskLevel = "medium";

      return {
        ...residentObj,
        complaints: complaints,
        complaintsCount: complaints.length,
        hasActiveComplaints: hasActiveComplaints,
        riskLevel: riskLevel,
        riskFactors: riskFactors,
        paymentStatus: "paid", // TODO: Implement payment status
        hasPendingDues: false, // TODO: Implement payment tracking
      };
    });

    // Apply additional filters
    let filteredResidents = enhancedResidents;
    if (complaintStatus === "active") {
      filteredResidents = filteredResidents.filter((r) => r.hasActiveComplaints);
    }
    if (riskLevel) {
      filteredResidents = filteredResidents.filter((r) => r.riskLevel === riskLevel);
    }
    if (verificationStatus) {
      if (verificationStatus === "pending") {
        filteredResidents = filteredResidents.filter((r) => r.status === "pending");
      } else if (verificationStatus === "approved") {
        filteredResidents = filteredResidents.filter((r) => r.status === "active");
      } else if (verificationStatus === "rejected") {
        filteredResidents = filteredResidents.filter((r) => r.status === "rejected");
      }
    }

    // Get statistics
    const totalResidents = await User.countDocuments({ ...filter, role: "resident" });
    const pendingCount = await User.countDocuments({
      ...filter,
      role: "resident",
      status: "pending",
    });
    const activeCount = await User.countDocuments({
      ...filter,
      role: "resident",
      status: "active",
    });
    const suspendedCount = await User.countDocuments({
      ...filter,
      role: "resident",
      status: "suspended",
    });

    // Count high-risk residents
    const allResidentsForStats = await User.find({
      ...filter,
      role: "resident",
    }).select("_id status");
    const allResidentIds = allResidentsForStats.map((r) => r._id);
    const allComplaints = await Complaint.find({
      createdBy: { $in: allResidentIds },
      status: { $in: ["Open", "Assigned", "In Progress"] },
    });
    const highRiskCount = allResidentsForStats.filter((r) => {
      const residentComplaints = allComplaints.filter(
        (c) => c.createdBy.toString() === r._id.toString()
      );
      return (
        r.status === "pending" ||
        r.status === "suspended" ||
        residentComplaints.length >= 2
      );
    }).length;

    res.status(200).json({
      success: true,
      data: {
        residents: filteredResidents,
        total: filteredResidents.length,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalResidents,
          pages: Math.ceil(totalResidents / parseInt(limit)),
        },
        statistics: {
          total: totalResidents,
          pending: pendingCount,
          active: activeCount,
          suspended: suspendedCount,
          highRisk: highRiskCount,
        },
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Get residents advanced error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching residents",
    });
  }
};

// @desc    Get building details with floors and flats - Admin only
// @route   GET /api/admin/building-details
// @access  Private (Admin)
const getBuildingDetails = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { buildingCode } = req.query; // Get building code from query params

    const admin = await User.findById(adminId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // If buildingCode is provided, use it; otherwise get first building
    let apartmentCode = buildingCode;
    if (!apartmentCode) {
      const firstBuilding = await Apartment.findOne({
        createdBy: adminId,
        isActive: true,
      })
        .select("code")
        .sort({ createdAt: 1 });
      if (firstBuilding) {
        apartmentCode = firstBuilding.code;
      } else {
        return res.status(404).json({
          success: false,
          message: "No building found",
        });
      }
    }

    // Verify building belongs to admin
    const building = await Apartment.findOne({
      code: apartmentCode,
      createdBy: adminId,
      isActive: true,
    });
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    // Get occupied flats
    const occupiedFlats = await User.find({
      apartmentCode: apartmentCode,
      role: "resident",
      status: "active",
    }).select("floorNumber flatNumber flatType fullName phoneNumber _id");

    // Map occupied flats for quick lookup
    const occupiedMap = {};
    const userIdMap = {};
    occupiedFlats.forEach((user) => {
      const key = `${user.floorNumber}-${user.flatNumber}`;
      occupiedMap[key] = {
        userId: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        flatType: user.flatType,
      };
      userIdMap[user._id.toString()] = key;
    });

    // Get active complaints for flats
    const activeComplaints = await Complaint.find({
      status: { $in: ["Open", "Assigned", "In Progress", "Reopened"] },
    })
      .populate("createdBy", "floorNumber flatNumber apartmentCode")
      .select("status priority category location createdBy");

    // Map complaints by flat
    const complaintsMap = {};
    activeComplaints.forEach((complaint) => {
      if (complaint.createdBy && complaint.createdBy.apartmentCode === apartmentCode) {
        const key = `${complaint.createdBy.floorNumber}-${complaint.createdBy.flatNumber}`;
        if (!complaintsMap[key]) {
          complaintsMap[key] = [];
        }
        complaintsMap[key].push({
          id: complaint._id,
          status: complaint.status,
          priority: complaint.priority,
          category: complaint.category,
        });
      }
    });

    // Enhance floors with occupancy info, complaints, and status
    const floorsWithDetails = building.configuration.floors.map((floor) => ({
      floorNumber: floor.floorNumber,
      flats: floor.flats.map((flat) => {
        const key = `${floor.floorNumber}-${flat.flatNumber}`;
        const isOccupied = flat.isOccupied || occupiedMap[key] != null;
        const flatComplaints = complaintsMap[key] || [];
        const hasActiveComplaints = flatComplaints.length > 0;
        const hasPendingDues = false; // TODO: Implement payment tracking
        
        // Determine flat status
        let status = isOccupied ? "occupied" : "vacant";
        if (hasActiveComplaints) {
          status = "has_complaints";
        }
        if (hasPendingDues) {
          status = "pending_dues";
        }

        return {
          flatNumber: flat.flatNumber,
          flatCode: flat.flatCode,
          flatType: flat.flatType,
          squareFeet: flat.squareFeet,
          isOccupied: isOccupied,
          occupiedBy: occupiedMap[key] || null,
          status: status,
          complaints: flatComplaints,
          hasPendingDues: hasPendingDues,
          complaintsCount: flatComplaints.length,
        };
      }),
    }));

    // Calculate comprehensive statistics
    const totalFlats =
      building.configuration.totalFloors * building.configuration.flatsPerFloor;
    const occupiedCount = occupiedFlats.length;
    const vacantCount = totalFlats - occupiedCount;
    const occupancyRate =
      totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0;

    // Count flats by status
    let occupiedFlatsCount = 0;
    let vacantFlatsCount = 0;
    let complaintsFlatsCount = 0;
    let pendingDuesCount = 0;

    floorsWithDetails.forEach((floor) => {
      floor.flats.forEach((flat) => {
        if (flat.status === "occupied") occupiedFlatsCount++;
        else if (flat.status === "vacant") vacantFlatsCount++;
        else if (flat.status === "has_complaints") complaintsFlatsCount++;
        else if (flat.status === "pending_dues") pendingDuesCount++;
      });
    });

    res.status(200).json({
      success: true,
      data: {
        building: {
          id: building._id,
          name: building.name,
          code: building.code,
          buildingCategory: building.buildingCategory,
          buildingType: building.buildingType,
          address: building.address,
          contact: building.contact,
          structuralDetails: building.structuralDetails,
          safetyCompliance: building.safetyCompliance,
          utilities: building.utilities,
          parking: building.parking,
          amenities: building.amenities,
          totalFloors: building.configuration.totalFloors,
          flatsPerFloor: building.configuration.flatsPerFloor,
          totalFlats: totalFlats,
          floors: floorsWithDetails,
          createdAt: building.createdAt,
          updatedAt: building.updatedAt,
        },
        statistics: {
          totalFlats: totalFlats,
          occupiedFlats: occupiedCount,
          vacantFlats: vacantCount,
          occupancyRate: parseFloat(occupancyRate),
          totalResidents: occupiedCount,
          totalStaff: await User.countDocuments({
            apartmentCode: apartmentCode,
            role: "staff",
            status: "active",
          }),
          flatsWithComplaints: complaintsFlatsCount,
          flatsWithPendingDues: pendingDuesCount,
        },
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Get building details error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching building details",
    });
  }
};

// @desc    Get available flats for user creation - Admin only
// @route   GET /api/admin/available-flats
// @access  Private (Admin)
const getAvailableFlats = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { buildingCode } = req.query;
    const admin = await User.findById(adminId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // If buildingCode is provided, use it; otherwise get first building
    let apartmentCode = buildingCode;
    if (!apartmentCode) {
      const firstBuilding = await Apartment.findOne({
        createdBy: adminId,
        isActive: true,
      })
        .select("code")
        .sort({ createdAt: 1 });
      if (firstBuilding) {
        apartmentCode = firstBuilding.code;
      } else {
        return res.status(404).json({
          success: false,
          message: "No building found. Please create a building first.",
        });
      }
    }

    // Verify building belongs to admin
    const building = await Apartment.findOne({
      code: apartmentCode,
      createdBy: adminId,
      isActive: true,
    });
    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found or access denied",
      });
    }

    // Get occupied flats
    const occupiedFlats = await User.find({
      apartmentCode: apartmentCode,
      role: "resident",
      status: "active",
    }).select("floorNumber flatNumber");

    // Create occupied map
    const occupiedMap = {};
    occupiedFlats.forEach((user) => {
      const key = `${user.floorNumber}-${user.flatNumber}`;
      occupiedMap[key] = true;
    });

    // Get available flats
    const availableFlats = [];
    building.configuration.floors.forEach((floor) => {
      floor.flats.forEach((flat) => {
        const key = `${floor.floorNumber}-${flat.flatNumber}`;
        if (!occupiedMap[key]) {
          availableFlats.push({
            floorNumber: floor.floorNumber,
            flatNumber: flat.flatNumber,
            flatType: flat.flatType,
            squareFeet: flat.squareFeet,
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      data: {
        availableFlats,
        total: availableFlats.length,
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Get available flats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available flats",
    });
  }
};

// @desc    Get building view with role-based filtering (Admin/Resident/Staff)
// @route   GET /api/admin/building-view
// @access  Private (Admin/Resident/Staff)
const getBuildingView = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    const { buildingCode } = req.query;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let apartmentCode = buildingCode || user.apartmentCode;
    if (!apartmentCode) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    // Get building
    let building;
    if (user.role === "admin") {
      building = await Apartment.findOne({
        code: apartmentCode,
        createdBy: userId,
        isActive: true,
      });
    } else {
      building = await Apartment.findByCode(apartmentCode);
    }

    if (!building) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    // Get occupied flats
    const occupiedFlats = await User.find({
      apartmentCode: apartmentCode,
      role: "resident",
      status: "active",
    }).select("floorNumber flatNumber flatType fullName phoneNumber _id");

    // Map occupied flats
    const occupiedMap = {};
    occupiedFlats.forEach((u) => {
      const key = `${u.floorNumber}-${u.flatNumber}`;
      occupiedMap[key] = {
        userId: u._id,
        fullName: u.fullName,
        phoneNumber: u.phoneNumber,
        flatType: u.flatType,
      };
    });

    // Get active complaints
    const activeComplaints = await Complaint.find({
      status: { $in: ["Open", "Assigned", "In Progress", "Reopened"] },
    })
      .populate("createdBy", "floorNumber flatNumber apartmentCode")
      .select("status priority category location createdBy");

    const complaintsMap = {};
    activeComplaints.forEach((c) => {
      if (c.createdBy && c.createdBy.apartmentCode === apartmentCode) {
        const key = `${c.createdBy.floorNumber}-${c.createdBy.flatNumber}`;
        if (!complaintsMap[key]) complaintsMap[key] = [];
        complaintsMap[key].push({
          id: c._id,
          status: c.status,
          priority: c.priority,
          category: c.category,
        });
      }
    });

    // Role-based filtering
    let filteredFloors = building.configuration.floors;
    if (user.role === "resident") {
      // Resident: Only show their flat
      filteredFloors = building.configuration.floors
        .filter((f) => f.floorNumber === user.floorNumber)
        .map((f) => ({
          ...f,
          flats: f.flats.filter((flat) => flat.flatNumber === user.flatNumber),
        }));
    } else if (user.role === "staff") {
      // Staff: Show flats with assigned complaints
      const Staff = require("../models/Staff");
      const staff = await Staff.findOne({ user: userId }).populate("user");
      if (staff) {
        const assignedComplaints = await Complaint.find({
          "assignedTo.staff": staff._id,
          status: { $in: ["Assigned", "In Progress"] },
        })
          .populate("createdBy", "floorNumber flatNumber apartmentCode")
          .select("createdBy");

        const assignedFlats = new Set();
        assignedComplaints.forEach((c) => {
          if (c.createdBy && c.createdBy.apartmentCode === apartmentCode) {
            assignedFlats.add(`${c.createdBy.floorNumber}-${c.createdBy.flatNumber}`);
          }
        });

        filteredFloors = building.configuration.floors.map((f) => ({
          ...f,
          flats: f.flats.filter((flat) => {
            const key = `${f.floorNumber}-${flat.flatNumber}`;
            return assignedFlats.has(key);
          }),
        }));
      }
    }

    // Enhance floors with status
    const floorsWithDetails = filteredFloors.map((floor) => ({
      floorNumber: floor.floorNumber,
      flats: floor.flats.map((flat) => {
        const key = `${floor.floorNumber}-${flat.flatNumber}`;
        const isOccupied = flat.isOccupied || occupiedMap[key] != null;
        const flatComplaints = complaintsMap[key] || [];
        const hasActiveComplaints = flatComplaints.length > 0;
        const hasPendingDues = false; // TODO: Implement payment tracking

        let status = isOccupied ? "occupied" : "vacant";
        if (hasActiveComplaints) status = "has_complaints";
        if (hasPendingDues) status = "pending_dues";

        return {
          flatNumber: flat.flatNumber,
          flatCode: flat.flatCode,
          flatType: flat.flatType,
          squareFeet: flat.squareFeet,
          isOccupied: isOccupied,
          occupiedBy: occupiedMap[key] || null,
          status: status,
          complaints: flatComplaints,
          hasPendingDues: hasPendingDues,
          complaintsCount: flatComplaints.length,
        };
      }),
    }));

    // Calculate statistics
    const totalFlats =
      building.configuration.totalFloors * building.configuration.flatsPerFloor;
    const occupiedCount = occupiedFlats.length;
    const vacantCount = totalFlats - occupiedCount;
    const occupancyRate =
      totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        building: {
          id: building._id,
          name: building.name,
          code: building.code,
          address: building.address,
          totalFloors: building.configuration.totalFloors,
          flatsPerFloor: building.configuration.flatsPerFloor,
          totalFlats: totalFlats,
          floors: floorsWithDetails,
        },
        statistics: {
          totalFlats: totalFlats,
          occupiedFlats: occupiedCount,
          vacantFlats: vacantCount,
          occupancyRate: parseFloat(occupancyRate),
        },
        userRole: user.role,
      },
    });
  } catch (error) {
    console.error("❌ [BUILDING VIEW] Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching building view",
    });
  }
};

// @desc    Bulk operations on residents
// @route   POST /api/admin/residents/bulk-action
// @access  Private (Admin)
const bulkResidentAction = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { action, residentIds, reason } = req.body;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!action || !residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Action and resident IDs are required",
      });
    }

    const validActions = [
      "approve",
      "reject",
      "suspend",
      "activate",
      "send_reminder",
      "assign_notice",
    ];

    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid action. Valid actions: ${validActions.join(", ")}`,
      });
    }

    // Get residents
    const residents = await User.find({
      _id: { $in: residentIds },
      role: "resident",
    });

    if (residents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No residents found",
      });
    }

    // Verify all residents belong to admin's buildings
    const adminBuildings = await Apartment.find({
      createdBy: adminId,
      isActive: true,
    }).select("code");
    const buildingCodes = adminBuildings.map((b) => b.code);

    const unauthorizedResidents = residents.filter(
      (r) => !buildingCodes.includes(r.apartmentCode)
    );

    if (unauthorizedResidents.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Some residents do not belong to your buildings",
      });
    }

    const results = {
      success: [],
      failed: [],
    };

    // Perform bulk action
    for (const resident of residents) {
      try {
        let updateData = {};
        let description = "";

        switch (action) {
          case "approve":
            updateData = { status: "active", isVerified: true };
            description = `Bulk approved by ${admin.fullName}`;
            break;
          case "reject":
            updateData = { status: "rejected" };
            description = `Bulk rejected by ${admin.fullName}${reason ? `: ${reason}` : ""}`;
            break;
          case "suspend":
            updateData = { status: "suspended" };
            description = `Bulk suspended by ${admin.fullName}${reason ? `: ${reason}` : ""}`;
            break;
          case "activate":
            updateData = { status: "active" };
            description = `Bulk activated by ${admin.fullName}`;
            break;
          case "send_reminder":
            // TODO: Implement payment reminder sending
            description = `Payment reminder sent by ${admin.fullName}`;
            break;
          case "assign_notice":
            // TODO: Implement notice assignment
            description = `Notice assigned by ${admin.fullName}`;
            break;
        }

        if (Object.keys(updateData).length > 0) {
          await User.findByIdAndUpdate(resident._id, updateData);
        }

        // Create audit log
        const AuditLog = require("../models/AuditLog");
        const auditActionMap = {
          approve: "USER_APPROVED",
          reject: "USER_REJECTED",
          suspend: "USER_SUSPENDED",
          activate: "USER_ACTIVATED",
          send_reminder: "ADMIN_ACTION",
          assign_notice: "ADMIN_ACTION",
        };
        await AuditLog.create({
          action: auditActionMap[action] || "ADMIN_ACTION",
          description: `${description} - Resident: ${resident.fullName} (${resident.flatNumber})`,
          performedBy: adminId,
          targetEntity: "User",
          targetEntityId: resident._id,
          metadata: {
            action: action,
            reason: reason || null,
            bulkOperation: true,
            totalAffected: residentIds.length,
          },
        });

        // Emit real-time event
        emitToUser(resident._id.toString(), "resident_status_updated", {
          message: `Your account has been ${action}ed`,
          action: action,
          updatedBy: admin.fullName,
        });

        results.success.push({
          id: resident._id,
          name: resident.fullName,
          flatNumber: resident.flatNumber,
        });
      } catch (error) {
        console.error(`Error processing resident ${resident._id}:`, error);
        results.failed.push({
          id: resident._id,
          name: resident.fullName,
          error: error.message,
        });
      }
    }

    // Broadcast to admin room
    emitToRoom("admin", "bulk_resident_action", {
      action: action,
      totalAffected: results.success.length,
      performedBy: adminId,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: `Bulk action completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
      data: {
        action: action,
        total: residentIds.length,
        succeeded: results.success.length,
        failed: results.failed.length,
        results: results,
      },
    });
  } catch (error) {
    console.error("❌ [ADMIN] Bulk resident action error:", error);
    res.status(500).json({
      success: false,
      message: "Error performing bulk action",
    });
  }
};

module.exports = {
  getAdminDashboard,
  getAllBuildings,
  getPendingApprovals,
  updateUserApproval,
  getAllComplaints,
  assignComplaintToStaff,
  getAllStaff,
  createApartment: createBuilding, // Keep backward compatibility
  createBuilding,
  createUser,
  getAllUsers,
  getBuildingDetails,
  getAvailableFlats,
  getBuildingView,
  getResidentsAdvanced,
  bulkResidentAction,
};
