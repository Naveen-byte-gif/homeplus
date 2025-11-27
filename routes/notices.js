const express = require('express');
const router = express.Router();
const {
  createNotice,
  getNotices,
  getNotice,
  updateNotice,
  publishNotice
} = require('../controllers/noticeController');
const { protect } = require('../middleware/auth');
const { authorize, requireAdmin } = require('../middleware/roleCheck');
const { validateNoticeCreation } = require('../middleware/validation');

// All routes are protected
router.use(protect);

// Public routes (all authenticated users)
router.get('/', getNotices);
router.get('/:id', getNotice);

// Admin routes
router.post('/', requireAdmin, validateNoticeCreation, createNotice);
router.put('/:id', requireAdmin, updateNotice);
router.put('/:id/publish', requireAdmin, publishNotice);

module.exports = router;