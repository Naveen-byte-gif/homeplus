const https = require('https');

/**
 * Brevo SMS Service - Production-Ready Implementation
 * Uses Brevo Transactional SMS API (not SMTP)
 */

// Brevo SMS API Configuration
const BREVO_SMS_API_URL = 'https://api.brevo.com/v3/transactionalSMS';
const BREVO_SMS_API_KEY = process.env.BREVO_API_KEY || process.env.BREVO_SMS_API_KEY;
const BREVO_SENDER_NAME = process.env.BREVO_SMS_SENDER || 'ApartmentSync';

// Validate Brevo SMS configuration on startup
if (BREVO_SMS_API_KEY) {
  console.log('✅ [SMS] Brevo SMS service configured');
  console.log(`📱 [SMS] Brevo API URL: ${BREVO_SMS_API_URL}`);
  console.log(`📱 [SMS] Sender Name: ${BREVO_SENDER_NAME}`);
} else {
  console.warn('⚠️ [SMS] Brevo SMS service NOT configured');
  console.warn('   - Missing: BREVO_API_KEY or BREVO_SMS_API_KEY');
  console.warn('   - SMS will be logged to console instead of sent');
}

/**
 * Format phone number to international format
 * @param {string} phoneNumber - Phone number (can be 10 digits or with country code)
 * @returns {string} - Formatted phone number with country code
 */
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.toString().replace(/\D/g, '');
  
  // If already has country code (starts with + or has 11+ digits), return as is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber.replace(/\D/g, '');
  }
  
  // If 10 digits, assume Indian number and add 91
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  
  // If 11 digits and starts with 0, remove leading 0 and add 91
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `91${cleaned.substring(1)}`;
  }
  
  // If 12 digits and starts with 91, return as is
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned;
  }
  
  // Default: assume it's already in correct format or return with 91
  return cleaned.length === 10 ? `91${cleaned}` : cleaned;
};

/**
 * Make HTTP request to Brevo SMS API
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} data - Request body data
 * @returns {Promise<object>} - API response
 */
const makeBrevoRequest = (endpoint, method = 'POST', data = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: method,
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_SMS_API_KEY,
        'content-type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({
              statusCode: res.statusCode,
              message: parsed.message || 'SMS API error',
              response: parsed
            });
          }
        } catch (error) {
          reject({
            statusCode: res.statusCode,
            message: 'Failed to parse response',
            error: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({
        statusCode: 0,
        message: 'Network error',
        error: error.message
      });
    });

    if (method === 'POST' && Object.keys(data).length > 0) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
};

/**
 * Send SMS using Brevo Transactional SMS API
 * @param {string} phoneNumber - Phone number to send SMS to
 * @param {string} message - SMS message content
 * @param {string} sender - Sender name (optional, defaults to BREVO_SMS_SENDER)
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendSMS = async (phoneNumber, message, sender = null) => {
  try {
    // Validate inputs
    if (!phoneNumber || !message) {
      console.error('❌ [SMS] Missing phone number or message');
      return {
        success: false,
        message: 'Phone number and message are required'
      };
    }

    // Format phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return {
        success: false,
        message: 'Invalid phone number format'
      };
    }

    console.log(`📱 [SMS] Sending SMS to ${formattedPhone} (original: ${phoneNumber})`);

    // Check if Brevo is configured
    if (!BREVO_SMS_API_KEY) {
      console.warn('⚠️ [SMS] Brevo API key not configured - logging SMS for development');
      console.log(`📱 [SMS] SMS for ${formattedPhone}: ${message}`);
      console.log(`📱 [SMS] ⚠️ SMS NOT SENT - Brevo credentials missing. Check server logs.`);
      return {
        success: true,
        message: 'SMS logged (Brevo not configured - check server logs)'
      };
    }

    // Prepare SMS data for Brevo API
    const smsData = {
      sender: sender || BREVO_SENDER_NAME,
      recipient: formattedPhone,
      content: message,
      type: 'transactional' // or 'marketing'
    };

    // Send SMS via Brevo API
    const response = await makeBrevoRequest(
      `${BREVO_SMS_API_URL}/sms`,
      'POST',
      smsData
    );

    console.log(`✅ [SMS] SMS sent successfully to ${formattedPhone}`);
    console.log(`📋 [SMS] Message ID: ${response.messageId || 'N/A'}`);
    console.log(`📋 [SMS] Status: ${response.status || 'sent'}`);

    return {
      success: true,
      message: 'SMS sent successfully',
      messageId: response.messageId,
      status: response.status
    };

  } catch (error) {
    console.error('❌ [SMS] Error sending SMS:', error);
    console.error('❌ [SMS] Error details:', {
      statusCode: error.statusCode,
      message: error.message,
      response: error.response
    });

    // Provide user-friendly error messages
    let errorMessage = 'Failed to send SMS. Please try again.';

    if (error.statusCode === 400) {
      errorMessage = 'Invalid request. Please check phone number format.';
    } else if (error.statusCode === 401) {
      errorMessage = 'Authentication failed. Please check Brevo API key.';
    } else if (error.statusCode === 402) {
      errorMessage = 'Insufficient credits. Please top up your Brevo account.';
    } else if (error.statusCode === 403) {
      errorMessage = 'Access forbidden. Please check API permissions.';
    } else if (error.message) {
      errorMessage = `SMS service error: ${error.message}`;
    }

    return {
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

/**
 * Send OTP via SMS using Brevo
 * @param {string} phoneNumber - Phone number to send OTP to
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendOTP = async (phoneNumber, otp) => {
  const message = `Your ApartmentSync verification code is: ${otp}. This code will expire in 5 minutes. Do not share this code with anyone.`;
  
  return await sendSMS(phoneNumber, message);
};

/**
 * Send welcome SMS
 * @param {string} phoneNumber - Phone number to send welcome SMS to
 * @param {string} userName - User's name
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendWelcomeSMS = async (phoneNumber, userName) => {
  const message = `Welcome to ApartmentSync, ${userName}! Your account has been created successfully. Download our app to get started.`;
  
  return await sendSMS(phoneNumber, message);
};

/**
 * Send notification SMS
 * @param {string} phoneNumber - Phone number to send notification to
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendNotificationSMS = async (phoneNumber, title, body) => {
  const message = `${title}\n\n${body}\n\n- ApartmentSync`;
  
  return await sendSMS(phoneNumber, message);
};

/**
 * Send urgent alert SMS
 * @param {string} phoneNumber - Phone number to send alert to
 * @param {string} alertMessage - Alert message
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
const sendUrgentAlertSMS = async (phoneNumber, alertMessage) => {
  const message = `🚨 URGENT ALERT 🚨\n\n${alertMessage}\n\nPlease check ApartmentSync app immediately.`;
  
  return await sendSMS(phoneNumber, message);
};

module.exports = {
  sendSMS,
  sendOTP,
  sendWelcomeSMS,
  sendNotificationSMS,
  sendUrgentAlertSMS,
  formatPhoneNumber // Export for testing/utility purposes
};
