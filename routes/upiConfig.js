const express = require('express');
const router = express.Router();
const {
  getUpiConfig,
  createOrUpdateUpiConfig,
  getPublicUpiConfig,
  addUpiId,
  setActiveUpiId,
  deleteUpiId
} = require('../controllers/upiConfigController');
const { protect } = require('../middleware/auth');
const { requireAdmin, authorize } = require('../middleware/roleCheck');
const { uploadConfigs } = require('../config/cloudinary');

// All routes are protected
router.use(protect);

// Admin routes
router.get('/', requireAdmin, getUpiConfig);
router.post('/', requireAdmin, uploadConfigs.profile.single('qrCodeImage'), createOrUpdateUpiConfig);

// UPI ID management routes
router.post('/upi-id', requireAdmin, addUpiId);
router.put('/upi-id/:id/active', requireAdmin, setActiveUpiId);
router.delete('/upi-id/:id', requireAdmin, deleteUpiId);

// Public route (for residents to get UPI ID)
router.get('/public', authorize('resident', 'owner'), getPublicUpiConfig);

module.exports = router;

