const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/staffController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes are protected and require staff access
router.use(protect);
router.use(authorize('staff'));

// Dashboard
router.get('/dashboard', getStaffDashboard);

// Building management
router.get('/buildings', getStaffBuildings);
router.get('/building-details', getBuildingDetails);

// User management (permission-based)
router.get('/users', getStaffUsers);
router.post('/users', createUser);

// Complaint management (permission-based)
router.get('/complaints', getStaffComplaints);
router.get('/assigned-complaints', getAssignedComplaints);

// Visitor management (permission-based)
router.get('/visitors', getStaffVisitors);

// Profile management
router.put('/availability', updateAvailability);
router.put('/specialization', updateSpecialization);

module.exports = router;