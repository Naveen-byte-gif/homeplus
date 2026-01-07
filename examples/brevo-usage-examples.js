/**
 * Brevo Email and SMS Usage Examples
 * 
 * This file demonstrates how to use the Brevo email and SMS services
 * in your application.
 */

const { sendEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendSMS, sendOTP, sendWelcomeSMS } = require('../services/smsService');

// ============================================
// EMAIL EXAMPLES
// ============================================

/**
 * Example 1: Send a simple email
 */
async function exampleSendSimpleEmail() {
  const result = await sendEmail(
    'user@example.com',
    'Welcome to ApartmentSync',
    '<h1>Welcome!</h1><p>Thank you for joining ApartmentSync.</p>'
  );

  if (result.success) {
    console.log('Email sent successfully:', result.messageId);
  } else {
    console.error('Failed to send email:', result.message);
  }
}

/**
 * Example 2: Send welcome email
 */
async function exampleSendWelcomeEmail() {
  const user = {
    email: 'newuser@example.com',
    fullName: 'John Doe',
    apartmentCode: 'APT001',
    wing: 'A',
    flatNumber: '101'
  };

  const result = await sendWelcomeEmail(user);

  if (result.success) {
    console.log('Welcome email sent:', result.messageId);
  } else {
    console.error('Failed to send welcome email:', result.message);
  }
}

/**
 * Example 3: Send email with attachments
 */
async function exampleSendEmailWithAttachments() {
  const attachments = [
    {
      filename: 'invoice.pdf',
      path: '/path/to/invoice.pdf'
    },
    {
      filename: 'receipt.png',
      path: '/path/to/receipt.png'
    }
  ];

  const result = await sendEmail(
    'user@example.com',
    'Your Invoice',
    '<p>Please find your invoice attached.</p>',
    attachments
  );

  if (result.success) {
    console.log('Email with attachments sent:', result.messageId);
  }
}

// ============================================
// SMS EXAMPLES
// ============================================

/**
 * Example 4: Send OTP via SMS
 */
async function exampleSendOTP() {
  const phoneNumber = '9876543210'; // Indian number (10 digits)
  const otp = '123456'; // 6-digit OTP

  const result = await sendOTP(phoneNumber, otp);

  if (result.success) {
    console.log('OTP sent successfully:', result.messageId);
  } else {
    console.error('Failed to send OTP:', result.message);
  }
}

/**
 * Example 5: Send welcome SMS
 */
async function exampleSendWelcomeSMS() {
  const phoneNumber = '9876543210';
  const userName = 'John Doe';

  const result = await sendWelcomeSMS(phoneNumber, userName);

  if (result.success) {
    console.log('Welcome SMS sent:', result.messageId);
  } else {
    console.error('Failed to send welcome SMS:', result.message);
  }
}

/**
 * Example 6: Send custom SMS
 */
async function exampleSendCustomSMS() {
  const phoneNumber = '9876543210';
  const message = 'Your visitor has arrived at the gate. Please approve entry.';
  const sender = 'ApartmentSync'; // Optional, defaults to BREVO_SMS_SENDER

  const result = await sendSMS(phoneNumber, message, sender);

  if (result.success) {
    console.log('SMS sent successfully:', result.messageId);
  } else {
    console.error('Failed to send SMS:', result.message);
  }
}

// ============================================
// INTEGRATION EXAMPLES
// ============================================

/**
 * Example 7: Send both email and SMS on user registration
 */
async function exampleUserRegistration(userData) {
  const { email, phoneNumber, fullName, apartmentCode, wing, flatNumber } = userData;

  // Send welcome email
  const emailResult = await sendWelcomeEmail({
    email,
    fullName,
    apartmentCode,
    wing,
    flatNumber
  });

  // Send welcome SMS
  const smsResult = await sendWelcomeSMS(phoneNumber, fullName);

  return {
    email: emailResult,
    sms: smsResult
  };
}

/**
 * Example 8: Send OTP via both email and SMS
 */
async function exampleSendOTPBothChannels(email, phoneNumber, otp) {
  // Send OTP via email
  const emailResult = await sendEmail(
    email,
    'Your Verification Code',
    `<h1>Your OTP is: ${otp}</h1><p>This code will expire in 5 minutes.</p>`
  );

  // Send OTP via SMS
  const smsResult = await sendOTP(phoneNumber, otp);

  return {
    email: emailResult,
    sms: smsResult
  };
}

// Export examples for testing
module.exports = {
  exampleSendSimpleEmail,
  exampleSendWelcomeEmail,
  exampleSendEmailWithAttachments,
  exampleSendOTP,
  exampleSendWelcomeSMS,
  exampleSendCustomSMS,
  exampleUserRegistration,
  exampleSendOTPBothChannels
};

