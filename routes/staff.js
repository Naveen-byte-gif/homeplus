const express = require('express');
const router = express.Router();
const {
  getStaffDashboard,
  getAssignedComplaints,
  updateAvailability,
  updateSpecialization
} = require('../controllers/staffController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes are protected and require staff access
router.use(protect);
router.use(authorize('staff'));

// Dashboard
router.get('/dashboard', getStaffDashboard);
router.get('/assigned-complaints', getAssignedComplaints);

// Profile management
router.put('/availability', updateAvailability);
router.put('/specialization', updateSpecialization);

module.exports = router;