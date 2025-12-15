const express = require('express');
const router = express.Router();
const {
  getUserDashboard,
  updateProfile,
  changePassword,
  updateFCMToken,
  getBuildingDetails,
  getAnnouncements
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Resident routes
router.get('/dashboard', authorize('resident', 'staff', 'admin'), getUserDashboard);
router.put('/profile', authorize('resident', 'staff', 'admin'), updateProfile);
router.put('/change-password', authorize('resident', 'staff', 'admin'), changePassword);
router.post('/fcm-token', authorize('resident', 'staff', 'admin'), updateFCMToken);

// Resident-specific routes
router.get('/building-details', authorize('resident'), getBuildingDetails);
router.get('/announcements', authorize('resident'), getAnnouncements);

module.exports = router;