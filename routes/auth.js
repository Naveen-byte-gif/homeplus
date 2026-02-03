const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

console.log('🔌 Auth routes loading...'); // Debug log

const {
  sendOTP,
  verifyOTPAndRegister,
  verifyOTPAndLogin,
  passwordLogin,
  getMe,
  adminLogin,
  adminRegister,
  verifyOTPAndAdminRegister,
  verifyOTPAndResetPassword
} = require('../controllers/authController');

// Debug each route
router.post('/send-otp', (req, res, next) => {
  console.log('📨 Send OTP route hit');
  next();
}, sendOTP);

router.post('/verify-otp-register', (req, res, next) => {
  console.log('✅ Verify OTP Register route hit');
  next();
}, verifyOTPAndRegister);

router.post('/verify-otp-login', (req, res, next) => {
  console.log('🔑 Verify OTP Login route hit');
  next();
}, verifyOTPAndLogin);

router.post('/password-login', (req, res, next) => {
  console.log('🗝️ Password Login route hit');
  next();
}, passwordLogin);

router.get('/me', protect, (req, res, next) => {
  console.log('👤 Get Me route hit');
  next();
}, getMe);

// Admin routes
router.post('/admin/login', (req, res, next) => {
  console.log('👔 Admin Login route hit');
  next();
}, adminLogin);

router.post('/admin/register', (req, res, next) => {
  console.log('👔 Admin Register route hit');
  next();
}, adminRegister);

router.post('/admin/verify-otp-register', (req, res, next) => {
  console.log('👔 Admin Verify OTP Register route hit');
  next();
}, verifyOTPAndAdminRegister);

router.post('/verify-otp-reset-password', (req, res, next) => {
  console.log('🔐 Verify OTP Reset Password route hit');
  next();
}, verifyOTPAndResetPassword);

console.log('✅ Auth routes loaded successfully');

module.exports = router;