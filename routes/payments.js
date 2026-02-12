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
const { requireAdmin, requireStaffOrAdmin, authorize } = require('../middleware/roleCheck');

// All routes are protected
router.use(protect);

// Resident/Owner: pay by mobile number, view own invoices, confirm payment
router.get('/invoices', authorize('resident', 'owner'), getMyInvoices);
router.get('/invoices/:id', authorize('resident', 'owner', 'admin', 'staff'), getInvoiceById);
router.post('/create-by-phone', authorize('resident', 'owner'), createPaymentByPhone);
router.post('/:id/confirm', authorize('resident', 'owner'), confirmPayment);

// Admin: all payments, verify, stats. Staff: list payments (own apartment only)
router.get('/', requireStaffOrAdmin, getAllPayments);
router.put('/:id/verify', requireAdmin, verifyPayment);
router.get('/stats', requireAdmin, getPaymentStats);

module.exports = router;

