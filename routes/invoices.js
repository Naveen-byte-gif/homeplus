const express = require('express');
const router = express.Router();
const {
  createInvoice,
  getAllInvoices,
  downloadInvoicePdf,
  getInvoiceStats
} = require('../controllers/invoiceController');
const { protect } = require('../middleware/auth');
const { requireAdmin, authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Admin routes
router.post('/', requireAdmin, createInvoice);
router.get('/', requireAdmin, getAllInvoices);
router.get('/stats', requireAdmin, getInvoiceStats);
router.get('/:id/pdf', authorize('resident', 'owner', 'admin'), downloadInvoicePdf);

module.exports = router;

