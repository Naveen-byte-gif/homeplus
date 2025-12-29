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
  getAvailableFlats,
  getBuildingView,
  getResidentsAdvanced,
  bulkResidentAction
} = require('../controllers/adminController');

// Import complaint controller for status updates
const {
  updateComplaintStatus,
  closeTicket,
  cancelTicket,
  reopenTicket
} = require('../controllers/complaintController');
const { protect } = require('../middleware/auth');
const { requireAdmin, authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Most routes require admin, but building-view allows all roles
// Apply admin check to all routes except building-view
router.use((req, res, next) => {
  if (req.path === '/building-view' || req.originalUrl.includes('/building-view')) {
    return next(); // Skip admin check for building-view
  }
  requireAdmin(req, res, next);
});
// router.use('/some-route', adminController.someMiddlewareFunction); // ← REMOVE OR COMMENT THIS LINE

// Dashboard
router.get('/dashboard', getAdminDashboard);

// User management
router.get('/pending-approvals', getPendingApprovals);
router.put('/users/:userId/approval', updateUserApproval);

// Complaint management
router.get('/complaints', getAllComplaints);
router.put('/complaints/:complaintId/assign', assignComplaintToStaff);
// Admin status update routes
router.put('/complaints/:id/status', updateComplaintStatus);
router.post('/complaints/:id/close', closeTicket);
router.post('/complaints/:id/cancel', cancelTicket);
router.post('/complaints/:id/reopen', reopenTicket);

// Staff management
router.get('/staff', getAllStaff);

// Building/Apartment management
router.get('/buildings', getAllBuildings);
router.post('/buildings', createBuilding);
router.post('/apartments', createApartment); // Keep for backward compatibility
router.get('/building-details', getBuildingDetails);
router.get('/building-view', getBuildingView); // Role-based building view
router.get('/available-flats', getAvailableFlats);

// User management
router.post('/users', createUser);
router.get('/users', getAllUsers);

// Resident management (advanced)
router.get('/residents', getResidentsAdvanced);
router.post('/residents/bulk-action', bulkResidentAction);

module.exports = router;