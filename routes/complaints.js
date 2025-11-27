const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaint,
  addWorkUpdate,
  updateComplaintStatus,
  rateComplaint
} = require('../controllers/complaintController');
const { protect } = require('../middleware/auth');
const { authorize, requireStaffOrAdmin } = require('../middleware/roleCheck');
const { validateComplaintCreation } = require('../middleware/validation');

// All routes are protected
router.use(protect);

// Resident routes
router.post('/', authorize('resident'), validateComplaintCreation, createComplaint);
router.get('/my-complaints', authorize('resident'), getMyComplaints);
router.get('/:id', getComplaint);
router.post('/:id/rate', authorize('resident'), rateComplaint);

// Staff routes
router.post('/:id/work-updates', authorize('staff'), addWorkUpdate);
router.put('/:id/status', requireStaffOrAdmin, updateComplaintStatus);

module.exports = router;