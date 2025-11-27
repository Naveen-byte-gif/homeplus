const express = require('express');
const router = express.Router();
const {
  getUserDashboard,
  updateProfile,
  changePassword
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Resident routes
router.get('/dashboard', authorize('resident', 'staff', 'admin'), getUserDashboard);
router.put('/profile', authorize('resident', 'staff', 'admin'), updateProfile);
router.put('/change-password', authorize('resident', 'staff', 'admin'), changePassword);

module.exports = router;