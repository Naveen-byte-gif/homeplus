const Staff = require('../models/Staff');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Apartment = require('../models/Apartment');
const Visitor = require('../models/Visitor');
const OTP = require('../models/OTP');
const { emitToUser, emitToRoom } = require('../services/socketService');
const { sendAccountCreatedEmail, sendAccountConfirmationEmail } = require('../services/emailService');
const { sendUserAccountCreatedNotification } = require('../services/notificationService');

// Helper function to get staff assigned buildings
const getStaffAssignedBuildings = async (staff) => {
  if (!staff || !staff.assignedBuildings || staff.assignedBuildings.length === 0) {
    return [];
  }
  
  const buildingCodes = staff.assignedBuildings.map(b => b.buildingCode);
  const buildings = await Apartment.find({
    code: { $in: buildingCodes },
    isActive: true
  }).select('name code address buildingCategory buildingType configuration.totalFloors configuration.flatsPerFloor createdAt');
  
  // Enrich with assignment info
  return buildings.map(building => {
    const assignment = staff.assignedBuildings.find(
      ab => ab.buildingCode === building.code
    );
    return {
      id: building._id,
      name: building.name,
      code: building.code,
      buildingCategory: building.buildingCategory,
      buildingType: building.buildingType,
      address: building.address,
      totalFloors: building.configuration.totalFloors,
      flatsPerFloor: building.configuration.flatsPerFloor,
      isPrimary: assignment?.isPrimary || false,
      assignedAt: assignment?.assignedAt || building.createdAt,
      totalFlats: building.configuration.totalFloors * building.configuration.flatsPerFloor
    };
  });
};

// @desc    Get staff dashboard with building-based data
// @route   GET /api/staff/dashboard
// @access  Private (Staff)
const getStaffDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingCode } = req.query;

    // Get staff profile
    const staff = await Staff.findOne({ user: userId })
      .populate('user', 'fullName phoneNumber profilePicture');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Get assigned buildings
    const assignedBuildings = await getStaffAssignedBuildings(staff);
    
    if (assignedBuildings.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          staff,
          buildings: [],
          dashboard: {
            pendingApprovals: 0,
            totalComplaints: 0,
            activeComplaints: 0,
            resolvedComplaints: 0,
            totalResidents: 0,
            todayVisitors: 0,
            openComplaints: 0
          }
        }
      });
    }

    // Determine which building to use
    let selectedBuildingCode = buildingCode;
    if (!selectedBuildingCode) {
      const primaryBuilding = staff.assignedBuildings.find(b => b.isPrimary);
      selectedBuildingCode = primaryBuilding 
        ? primaryBuilding.buildingCode 
        : staff.assignedBuildings[0].buildingCode;
    }

    // Verify staff has access to this building
    const hasAccess = staff.assignedBuildings.some(
      b => b.buildingCode === selectedBuildingCode
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this building'
      });
    }

    // Get building details
    const building = await Apartment.findOne({
      code: selectedBuildingCode,
      isActive: true
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Get statistics for selected building
    const totalFlats = building.configuration.totalFloors * building.configuration.flatsPerFloor;
    const occupiedCount = await User.countDocuments({
      apartmentCode: selectedBuildingCode,
      role: 'resident',
      status: 'active'
    });
    const vacantCount = totalFlats - occupiedCount;
    const occupancyRate = totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0;

    // Get pending approvals (only for assigned buildings)
    const pendingUsers = await User.countDocuments({
      apartmentCode: selectedBuildingCode,
      status: 'pending',
      role: 'resident'
    });

    // Get complaint statistics for assigned buildings
    const buildingCodes = staff.assignedBuildings.map(b => b.buildingCode);
    const complaintStats = await Complaint.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $match: {
          'user.apartmentCode': { $in: buildingCodes }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          assigned: { $sum: { $cond: [{ $eq: ['$status', 'Assigned'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } }
        }
      }
    ]);

    const stats = complaintStats[0] || {
      total: 0,
      open: 0,
      assigned: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0
    };

    // Get today's visitors for assigned buildings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayVisitors = await Visitor.countDocuments({
      apartmentCode: { $in: buildingCodes },
      entryDate: { $gte: today },
      status: { $in: ['Checked In', 'Pending'] }
    });

    // Get assigned complaints
    const assignedComplaints = await Complaint.find({
      'assignedTo.staff': staff._id,
      status: { $in: ['Assigned', 'In Progress'] }
    })
    .populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture apartmentCode')
    .sort({ priority: -1, createdAt: 1 })
    .limit(10);

    // Filter assigned complaints by building access
    const accessibleComplaints = assignedComplaints.filter(complaint => {
      if (!complaint.createdBy || !complaint.createdBy.apartmentCode) return false;
      return buildingCodes.includes(complaint.createdBy.apartmentCode);
    });

    // Get recent completed complaints
    const recentCompletedComplaints = await Complaint.find({
      'assignedTo.staff': staff._id,
      status: { $in: ['Resolved', 'Closed'] }
    })
    .populate('createdBy', 'fullName wing flatNumber apartmentCode')
    .sort({ updatedAt: -1 })
    .limit(5);
    
    const recentCompleted = recentCompletedComplaints.filter(c => 
      c.createdBy && c.createdBy.apartmentCode && 
      buildingCodes.includes(c.createdBy.apartmentCode)
    );

    // Get performance stats
    const performanceStats = await Complaint.aggregate([
      {
        $match: {
          'assignedTo.staff': staff._id,
          status: { $in: ['Resolved', 'Closed'] }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $match: {
          'user.apartmentCode': { $in: buildingCodes }
        }
      },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          averageRating: { $avg: '$rating.score' },
          averageResolutionTime: {
            $avg: {
              $divide: [
                { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
                1000 * 60 * 60
              ]
            }
          }
        }
      }
    ]);

    const perfStats = performanceStats[0] || {
      totalCompleted: 0,
      averageRating: 0,
      averageResolutionTime: 0
    };

    // Convert staff to object and ensure permissions are included
    const staffObj = staff.toObject();
    
    res.status(200).json({
      success: true,
      data: {
        staff: {
          ...staffObj,
          permissions: staff.permissions || {}
        },
        buildings: assignedBuildings,
        dashboard: {
          pendingApprovals: pendingUsers,
          totalComplaints: stats.total,
          activeComplaints: stats.open + stats.assigned + stats.inProgress,
          resolvedComplaints: stats.resolved + stats.closed,
          openComplaints: stats.open,
          totalResidents: occupiedCount,
          todayVisitors: todayVisitors,
          building: {
            totalFlats,
            occupiedFlats: occupiedCount,
            vacantFlats: vacantCount,
            occupancyRate: parseFloat(occupancyRate)
          },
          performance: {
            activeAssignments: accessibleComplaints.length,
            totalCompleted: perfStats.totalCompleted,
            averageRating: Math.round(perfStats.averageRating * 10) / 10 || 0,
            averageResolutionTime: Math.round(perfStats.averageResolutionTime * 10) / 10 || 0,
            currentWorkload: staff.currentWorkload || { activeComplaints: 0, maxCapacity: 10 }
          }
        },
        assignedComplaints: accessibleComplaints.map(c => {
          const complaintObj = c.toObject ? c.toObject() : c;
          return {
            _id: complaintObj._id,
            title: complaintObj.title,
            description: complaintObj.description,
            status: complaintObj.status,
            priority: complaintObj.priority,
            ticketNumber: complaintObj.ticketNumber,
            createdAt: complaintObj.createdAt,
            createdBy: complaintObj.createdBy ? {
              _id: complaintObj.createdBy._id,
              fullName: complaintObj.createdBy.fullName,
              phoneNumber: complaintObj.createdBy.phoneNumber,
              wing: complaintObj.createdBy.wing,
              flatNumber: complaintObj.createdBy.flatNumber,
              apartmentCode: complaintObj.createdBy.apartmentCode,
              profilePicture: complaintObj.createdBy.profilePicture
            } : null
          };
        }),
        recentCompleted: recentCompleted.map(c => {
          const complaintObj = c.toObject ? c.toObject() : c;
          return {
            _id: complaintObj._id,
            title: complaintObj.title,
            status: complaintObj.status,
            createdAt: complaintObj.createdAt,
            createdBy: complaintObj.createdBy ? {
              _id: complaintObj.createdBy._id,
              fullName: complaintObj.createdBy.fullName,
              wing: complaintObj.createdBy.wing,
              flatNumber: complaintObj.createdBy.flatNumber,
              apartmentCode: complaintObj.createdBy.apartmentCode
            } : null
          };
        })
      }
    });

  } catch (error) {
    console.error('Get staff dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching staff dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get staff's assigned complaints
// @route   GET /api/staff/assigned-complaints
// @access  Private (Staff)
const getAssignedComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    // Get staff profile
    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Build filter
    const filter = { 'assignedTo.staff': staff._id };
    if (status) filter.status = status;

    // Pagination
    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(filter)
      .populate('createdBy', 'fullName phoneNumber wing flatNumber profilePicture')
      .sort({ priority: -1, createdAt: 1 })
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
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get assigned complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned complaints'
    });
  }
};

// @desc    Update staff availability
// @route   PUT /api/staff/availability
// @access  Private (Staff)
const updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const { schedule, currentStatus, nextAvailable } = req.body;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Update availability
    if (schedule) staff.availability.schedule = schedule;
    if (currentStatus) staff.availability.currentStatus = currentStatus;
    if (nextAvailable) staff.availability.nextAvailable = nextAvailable;

    await staff.save();

    // Notify admins about availability change
    emitToRoom('admin', 'staff_availability_updated', {
      staffId: staff._id,
      currentStatus: staff.availability.currentStatus,
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: { availability: staff.availability }
    });

  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating availability'
    });
  }
};

// @desc    Update staff specialization
// @route   PUT /api/staff/specialization
// @access  Private (Staff)
const updateSpecialization = async (req, res) => {
  try {
    const userId = req.user.id;
    const { specialization } = req.body;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    staff.specialization = specialization;
    await staff.save();

    res.status(200).json({
      success: true,
      message: 'Specialization updated successfully',
      data: { specialization: staff.specialization }
    });

  } catch (error) {
    console.error('Update specialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating specialization'
    });
  }
};

// @desc    Get staff assigned buildings
// @route   GET /api/staff/buildings
// @access  Private (Staff)
const getStaffBuildings = async (req, res) => {
  try {
    const userId = req.user.id;
    const staff = await Staff.findOne({ user: userId });
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    const buildings = await getStaffAssignedBuildings(staff);

    // Get statistics for each building
    const buildingsWithStats = await Promise.all(
      buildings.map(async (building) => {
        const totalFlats = building.totalFloors * building.flatsPerFloor;
        const occupiedCount = await User.countDocuments({
          apartmentCode: building.code,
          role: 'resident',
          status: 'active'
        });
        const vacantCount = totalFlats - occupiedCount;
        const occupancyRate = totalFlats > 0 
          ? ((occupiedCount / totalFlats) * 100).toFixed(2) 
          : 0;

        return {
          ...building,
          totalFlats,
          occupiedFlats: occupiedCount,
          vacantFlats: vacantCount,
          occupancyRate: parseFloat(occupancyRate)
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        buildings: buildingsWithStats,
        totalBuildings: buildingsWithStats.length
      }
    });
  } catch (error) {
    console.error('Get staff buildings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching buildings'
    });
  }
};

// @desc    Get building details (staff access only)
// @route   GET /api/staff/building-details
// @access  Private (Staff)
const getBuildingDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingCode } = req.query;

    if (!buildingCode) {
      return res.status(400).json({
        success: false,
        message: 'Building code is required'
      });
    }

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Verify staff has access
    const hasAccess = staff.assignedBuildings.some(
      b => b.buildingCode === buildingCode.toUpperCase()
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this building'
      });
    }

    const building = await Apartment.findOne({
      code: buildingCode.toUpperCase(),
      isActive: true
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Get statistics
    const totalFlats = building.configuration.totalFloors * building.configuration.flatsPerFloor;
    const occupiedCount = await User.countDocuments({
      apartmentCode: building.code,
      role: 'resident',
      status: 'active'
    });
    const vacantCount = totalFlats - occupiedCount;

    res.status(200).json({
      success: true,
      data: {
        building: {
          id: building._id,
          name: building.name,
          code: building.code,
          address: building.address,
          buildingCategory: building.buildingCategory,
          buildingType: building.buildingType,
          totalFloors: building.configuration.totalFloors,
          flatsPerFloor: building.configuration.flatsPerFloor,
          totalFlats,
          occupiedFlats: occupiedCount,
          vacantFlats: vacantCount,
          occupancyRate: totalFlats > 0 ? ((occupiedCount / totalFlats) * 100).toFixed(2) : 0
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

// @desc    Get users for assigned buildings (permission-based)
// @route   GET /api/staff/users
// @access  Private (Staff)
const getStaffUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingCode, status, role, search, page = 1, limit = 50 } = req.query;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Check permission
    if (!staff.permissions?.canManageAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view users'
      });
    }

    // Get assigned building codes
    const buildingCodes = staff.assignedBuildings.map(b => b.buildingCode);
    
    if (buildingCodes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          users: [],
          pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 }
        }
      });
    }

    // Build query
    const query = {
      apartmentCode: { $in: buildingCodes },
      role: { $in: ['resident', 'staff'] }
    };

    if (buildingCode) {
      if (!buildingCodes.includes(buildingCode.toUpperCase())) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this building'
        });
      }
      query.apartmentCode = buildingCode.toUpperCase();
    }

    if (status) query.status = status;
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { flatNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get staff users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
};

// @desc    Create user (resident) for assigned buildings
// @route   POST /api/staff/users
// @access  Private (Staff)
const createUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      phoneNumber,
      email,
      password,
      buildingCode,
      floorNumber,
      flatNumber,
      flatType
    } = req.body;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Check permission
    if (!staff.permissions?.canManageAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create users'
      });
    }

    // Validate building access
    if (!buildingCode) {
      return res.status(400).json({
        success: false,
        message: 'Building code is required'
      });
    }

    const hasAccess = staff.assignedBuildings.some(
      b => b.buildingCode === buildingCode.toUpperCase()
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this building'
      });
    }

    // Get building
    const building = await Apartment.findOne({
      code: buildingCode.toUpperCase(),
      isActive: true
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Validate required fields
    if (!fullName || !email || !password || !floorNumber || !flatNumber || !flatType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { phoneNumber: phoneNumber?.trim() }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    // Check if flat is available
    const existingResident = await User.findOne({
      apartmentCode: buildingCode.toUpperCase(),
      floorNumber: parseInt(floorNumber),
      flatNumber: flatNumber.toUpperCase(),
      role: 'resident',
      status: 'active'
    });

    if (existingResident) {
      return res.status(409).json({
        success: false,
        message: 'This flat already has an active resident'
      });
    }

    // Create user
    const flatDetails = building.getFlatDetails(parseInt(floorNumber), flatNumber.toUpperCase());
    let flatCode = flatDetails?.flatCode || '';

    if (!flatCode) {
      const buildingPrefix = building.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
      const flatNumStr = flatNumber.replace(/[^0-9]/g, '');
      flatCode = `${buildingPrefix}-${floorNumber}-${flatNumStr.padStart(2, '0')}`;
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber?.trim(),
      password: String(password),
      role: 'resident',
      apartmentCode: buildingCode.toUpperCase(),
      floorNumber: parseInt(floorNumber),
      flatNumber: flatNumber.toUpperCase(),
      flatCode: flatCode.toUpperCase(),
      flatType,
      wing: 'A',
      status: 'active',
      isVerified: true,
      registeredAt: new Date(),
      lastUpdatedAt: new Date()
    });

    // Mark flat as occupied
    building.markFlatOccupied(parseInt(floorNumber), flatNumber.toUpperCase(), user._id);
    await building.save();

    // Send notification
    if (user.email) {
      try {
        const otpData = await OTP.generateOTP(user.email, 'registration', 'email');
        await sendAccountCreatedEmail(user, otpData.otp);
      } catch (emailError) {
        console.warn('Email sending failed:', emailError);
      }
    }

    emitToRoom(`apartment_${buildingCode}`, 'user_created', {
      message: 'New resident created',
      buildingCode: buildingCode.toUpperCase(),
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        email: user.email
      },
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get complaints for assigned buildings
// @route   GET /api/staff/complaints
// @access  Private (Staff)
const getStaffComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingCode, status, priority, page = 1, limit = 50 } = req.query;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Check permission
    if (!staff.permissions?.canManageComplaints) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view complaints'
      });
    }

    const buildingCodes = staff.assignedBuildings.map(b => b.buildingCode);
    
    if (buildingCodes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          complaints: [],
          pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 }
        }
      });
    }

    // Build query
    const targetBuildingCode = buildingCode ? buildingCode.toUpperCase() : null;
    
    if (targetBuildingCode && !buildingCodes.includes(targetBuildingCode)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this building'
      });
    }

    // Build match conditions
    const buildingMatch = targetBuildingCode 
      ? { 'user.apartmentCode': targetBuildingCode }
      : { 'user.apartmentCode': { $in: buildingCodes } };

    const statusMatch = status ? { status } : {};
    const priorityMatch = priority ? { priority } : {};

    // Get complaints for assigned buildings
    const complaints = await Complaint.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $match: {
          ...buildingMatch,
          ...statusMatch,
          ...priorityMatch
        }
      },
      {
        $sort: { priority: -1, createdAt: -1 }
      },
      {
        $skip: (parseInt(page) - 1) * parseInt(limit)
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const totalResult = await Complaint.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $match: {
          ...buildingMatch,
          ...statusMatch,
          ...priorityMatch
        }
      },
      {
        $count: 'total'
      }
    ]);

    const total = totalResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: {
        complaints,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get staff complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaints'
    });
  }
};

// @desc    Get visitors for assigned buildings
// @route   GET /api/staff/visitors
// @access  Private (Staff)
const getStaffVisitors = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingCode, status, search, page = 1, limit = 50 } = req.query;

    const staff = await Staff.findOne({ user: userId });
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found'
      });
    }

    // Check permission
    if (!staff.permissions?.canManageVisitors) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view visitors'
      });
    }

    const buildingCodes = staff.assignedBuildings.map(b => b.buildingCode);
    
    if (buildingCodes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          visitors: [],
          pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 }
        }
      });
    }

    // Build query
    const query = {
      apartmentCode: buildingCode 
        ? buildingCode.toUpperCase() 
        : { $in: buildingCodes }
    };

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { visitorName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { visitorType: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const visitors = await Visitor.find(query)
      .populate('hostResident', 'fullName phoneNumber wing flatNumber email')
      .populate('createdBy', 'fullName role email phoneNumber')
      .populate('checkedInBy', 'fullName role')
      .populate('checkedOutBy', 'fullName role')
      .sort({ entryDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Visitor.countDocuments(query);

    // Get statistics
    const stats = {
      total,
      pending: await Visitor.countDocuments({ ...query, status: 'Pending' }),
      checkedIn: await Visitor.countDocuments({ ...query, status: 'Checked In' }),
      checkedOut: await Visitor.countDocuments({ ...query, status: 'Checked Out' }),
      overdue: await Visitor.countDocuments({
        ...query,
        status: 'Checked In',
        expectedCheckOutTime: { $lt: new Date() }
      })
    };

    res.status(200).json({
      success: true,
      data: {
        visitors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        stats
      }
    });
  } catch (error) {
    console.error('Get staff visitors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching visitors'
    });
  }
};

module.exports = {
  getStaffDashboard,
  getAssignedComplaints,
  updateAvailability,
  updateSpecialization,
  getStaffBuildings,
  getBuildingDetails,
  getStaffUsers,
  createUser,
  getStaffComplaints,
  getStaffVisitors
};