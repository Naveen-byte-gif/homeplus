const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireStaffOrAdmin } = require('../middleware/roleCheck');
const { sendEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendSMS, sendOTP, sendWelcomeSMS } = require('../services/smsService');

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/communication/send-email
 * @desc    Send email (example endpoint)
 * @access  Private (Admin, Staff)
 */
router.post('/send-email', requireStaffOrAdmin, async (req, res) => {
  try {
    const { to, subject, html, text } = req.body;

    // Validate required fields
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide to, subject, and html/text fields'
      });
    }

    // Send email
    const result = await sendEmail(to, subject, html || text);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Email sent successfully',
        data: {
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending email',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/communication/send-welcome-email
 * @desc    Send welcome email (example use case)
 * @access  Private (Admin, Staff)
 */
router.post('/send-welcome-email', requireStaffOrAdmin, async (req, res) => {
  try {
    const { email, fullName, apartmentCode, wing, flatNumber } = req.body;

    // Validate required fields
    if (!email || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and fullName'
      });
    }

    // Create user object for welcome email
    const user = {
      email,
      fullName,
      apartmentCode: apartmentCode || 'N/A',
      wing: wing || 'N/A',
      flatNumber: flatNumber || 'N/A'
    };

    // Send welcome email
    const result = await sendWelcomeEmail(user);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Welcome email sent successfully',
        data: {
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending welcome email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending welcome email',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/communication/send-sms
 * @desc    Send SMS (example endpoint)
 * @access  Private (Admin, Staff)
 */
router.post('/send-sms', requireStaffOrAdmin, async (req, res) => {
  try {
    const { phoneNumber, message, sender } = req.body;

    // Validate required fields
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phoneNumber and message'
      });
    }

    // Send SMS
    const result = await sendSMS(phoneNumber, message, sender);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'SMS sent successfully',
        data: {
          messageId: result.messageId,
          status: result.status
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending SMS',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/communication/send-otp
 * @desc    Send OTP via SMS (example use case)
 * @access  Private (Admin, Staff)
 */
router.post('/send-otp', requireStaffOrAdmin, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Validate required fields
    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phoneNumber and otp'
      });
    }

    // Validate OTP format (should be 4-6 digits)
    if (!/^\d{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 4-6 digits'
      });
    }

    // Send OTP via SMS
    const result = await sendOTP(phoneNumber, otp);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          messageId: result.messageId,
          status: result.status
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending OTP',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/communication/send-welcome-sms
 * @desc    Send welcome SMS (example use case)
 * @access  Private (Admin, Staff)
 */
router.post('/send-welcome-sms', requireStaffOrAdmin, async (req, res) => {
  try {
    const { phoneNumber, userName } = req.body;

    // Validate required fields
    if (!phoneNumber || !userName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phoneNumber and userName'
      });
    }

    // Send welcome SMS
    const result = await sendWelcomeSMS(phoneNumber, userName);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Welcome SMS sent successfully',
        data: {
          messageId: result.messageId,
          status: result.status
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending welcome SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending welcome SMS',
      error: error.message
    });
  }
});

module.exports = router;

