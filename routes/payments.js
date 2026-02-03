const express = require('express');
const router = express.Router();
const {
  getMyInvoices,
  getInvoiceById,
  createPayment,
  createPaymentByPhone,
  confirmPayment,
  getAllPayments,
  verifyPayment,
  getPaymentStats
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { requireAdmin, authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Resident routes
router.get('/invoices', authorize('resident', 'owner'), getMyInvoices);
router.get('/invoices/:id', authorize('resident', 'owner', 'admin'), getInvoiceById);
router.post('/create', authorize('resident', 'owner'), createPayment); // With invoice
router.post('/create-by-phone', authorize('resident', 'owner'), createPaymentByPhone); // Phone-based, no invoice
router.post('/:id/confirm', authorize('resident', 'owner'), confirmPayment);

// Admin routes
router.get('/', requireAdmin, getAllPayments);
router.put('/:id/verify', requireAdmin, verifyPayment);
router.get('/stats', requireAdmin, getPaymentStats);

module.exports = router;

