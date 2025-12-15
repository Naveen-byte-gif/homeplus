const express = require('express');
const router = express.Router();
const {
  getAdminDashboard,
  getAllBuildings,
  getPendingApprovals,
  updateUserApproval,
  getAllComplaints,
  assignComplaintToStaff,
  getAllStaff,
  createApartment,
  createBuilding,
  createUser,
  getAllUsers,
  getBuildingDetails,
  getAvailableFlats
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

// All routes are protected and require admin access
router.use(protect);
router.use(requireAdmin);
// router.use('/some-route', adminController.someMiddlewareFunction); // ← REMOVE OR COMMENT THIS LINE

// Dashboard
router.get('/dashboard', getAdminDashboard);

// User management
router.get('/pending-approvals', getPendingApprovals);
router.put('/users/:userId/approval', updateUserApproval);

// Complaint management
router.get('/complaints', getAllComplaints);
router.put('/complaints/:complaintId/assign', assignComplaintToStaff);

// Staff management
router.get('/staff', getAllStaff);

// Building/Apartment management
router.get('/buildings', getAllBuildings);
router.post('/buildings', createBuilding);
router.post('/apartments', createApartment); // Keep for backward compatibility
router.get('/building-details', getBuildingDetails);
router.get('/available-flats', getAvailableFlats);

// User management
router.post('/users', createUser);
router.get('/users', getAllUsers);

module.exports = router;