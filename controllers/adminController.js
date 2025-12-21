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
    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Get all buildings created by this admin
    const buildings = await Apartment.find({
      createdBy: adminId,
      isActive: true,
    })
      .select(
        "name code address buildingCategory buildingType configuration.totalFloors configuration.flatsPerFloor createdAt"
      )
      .sort({ createdAt: -1 });

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
    const userIds = apartmentUsers.map((user) => user._id);

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

    // Get admin's apartment code
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const staff = await Staff.find()
      .populate({
        path: "user",
        match: { apartmentCode: admin.apartmentCode },
        select: "fullName phoneNumber email profilePicture",
      })
      .then((staff) => staff.filter((s) => s.user)); // Filter by apartment

    res.status(200).json({
      success: true,
      data: { staff },
    });
  } catch (error) {
    console.error("Get all staff error:", error);
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

    // Allow multiple buildings per admin - no restriction

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

    // Activate admin account if not already active
    if (admin.status !== "active") {
      admin.status = "active";
      await admin.save();
      console.log(`✅ [ADMIN] Admin account activated`);
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
    }).select("floorNumber flatNumber flatType fullName phoneNumber");

    // Map occupied flats for quick lookup
    const occupiedMap = {};
    occupiedFlats.forEach((user) => {
      const key = `${user.floorNumber}-${user.flatNumber}`;
      occupiedMap[key] = {
        userId: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        flatType: user.flatType,
      };
    });

    // Enhance floors with occupancy info
    const floorsWithDetails = building.configuration.floors.map((floor) => ({
      floorNumber: floor.floorNumber,
      flats: floor.flats.map((flat) => {
        const key = `${floor.floorNumber}-${flat.flatNumber}`;
        return {
          flatNumber: flat.flatNumber,
          flatType: flat.flatType,
          squareFeet: flat.squareFeet,
          isOccupied: flat.isOccupied || occupiedMap[key] != null,
          occupiedBy: occupiedMap[key] || null,
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
};
