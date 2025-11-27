const express = require('express');
const router = express.Router();
const {
  getAdminDashboard,
  getPendingApprovals,
  updateUserApproval,
  getAllComplaints,
  assignComplaintToStaff,
  getAllStaff
} = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/auth');

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

module.exports = router;