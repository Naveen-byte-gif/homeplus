const twilio = require('twilio');

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Log Twilio configuration status on startup
if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
  console.log('✅ [SMS] Twilio SMS service configured and ready');
  console.log(`📱 [SMS] Twilio Phone Number: ${process.env.TWILIO_PHONE_NUMBER}`);
} else {
  console.warn('⚠️ [SMS] Twilio SMS service NOT configured');
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.warn('   - Missing: TWILIO_ACCOUNT_SID');
  }
  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('   - Missing: TWILIO_AUTH_TOKEN');
  }
  if (!process.env.TWILIO_PHONE_NUMBER) {
    console.warn('   - Missing: TWILIO_PHONE_NUMBER');
  }
  console.warn('   - OTPs will be logged to console instead of sent via SMS');
  console.warn('   - Add credentials to .env file to enable SMS sending');
}

/**
 * Format phone number to E.164 format
 * @param {string} phoneNumber - Phone number (can be 10 digits or with country code)
 * @returns {string} - Formatted phone number in E.164 format
 */
const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // If already has country code (starts with + or has 11+ digits), return as is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // If 10 digits, assume Indian number and add +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  
  // If 11 digits and starts with 0, remove leading 0 and add +91
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `+91${cleaned.substring(1)}`;
  }
  
  // If 12 digits and starts with 91, add +
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  
  // Default: assume it's already in correct format or return with +91
  return cleaned.length === 10 ? `+91${cleaned}` : `+${cleaned}`;
};

/**
 * Send OTP via SMS using Twilio
 * @param {string} phoneNumber - Phone number to send OTP to
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<{success: boolean, message: string, sid?: string}>}
 */
const sendOTP = async (phoneNumber, otp) => {
  // Format phone number outside try block so it's available in catch
  let formattedPhone = phoneNumber;
  
  try {
    // Validate inputs
    if (!phoneNumber || !otp) {
      console.error('❌ [SMS] Missing phone number or OTP');
      return { 
        success: false, 
        message: 'Phone number and OTP are required' 
      };
    }

    // Format phone number
    formattedPhone = formatPhoneNumber(phoneNumber);
    console.log(`📱 [SMS] Sending OTP to ${formattedPhone} (original: ${phoneNumber})`);

    // Check if Twilio is configured
    if (!twilioClient) {
      console.warn('⚠️ [SMS] Twilio client not initialized - logging OTP for development');
      console.warn('⚠️ [SMS] To enable SMS sending, add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env file');
      console.log(`📱 [SMS] OTP for ${formattedPhone}: ${otp}`);
      console.log(`📱 [SMS] ⚠️ SMS NOT SENT - Twilio credentials missing. Check server logs for OTP.`);
      return { 
        success: true, 
        message: 'OTP logged (Twilio not configured - check server logs for OTP code)' 
      };
    }

    // Check if Twilio phone number is configured
    if (!process.env.TWILIO_PHONE_NUMBER) {
      console.warn('⚠️ [SMS] TWILIO_PHONE_NUMBER not configured - logging OTP');
      console.warn('⚠️ [SMS] To enable SMS sending, add TWILIO_PHONE_NUMBER to .env file');
      console.log(`📱 [SMS] OTP for ${formattedPhone}: ${otp}`);
      console.log(`📱 [SMS] ⚠️ SMS NOT SENT - Twilio phone number missing. Check server logs for OTP.`);
      return { 
        success: true, 
        message: 'OTP logged (Twilio phone number not configured - check server logs for OTP code)' 
      };
    }

    // Send SMS via Twilio
    const message = await twilioClient.messages.create({
      body: `Your ApartmentSync verification code is: ${otp}. This code will expire in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log(`✅ [SMS] OTP sent successfully to ${formattedPhone}`);
    console.log(`📋 [SMS] Message SID: ${message.sid}`);
    console.log(`📋 [SMS] Message Status: ${message.status}`);
    
    return { 
      success: true, 
      message: 'OTP sent successfully',
      sid: message.sid,
      status: message.status
    };
  } catch (error) {
    console.error('❌ [SMS] Error sending OTP:', error);
    console.error('❌ [SMS] Error details:', {
      code: error.code,
      message: error.message,
      status: error.status,
      moreInfo: error.moreInfo
    });
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to send OTP. Please try again.';
    
    if (error.code === 21211) {
      errorMessage = 'Invalid phone number format. Please check and try again.';
    } else if (error.code === 21608) {
      // Trial account limitation - phone number needs to be verified
      console.error('❌ [SMS] Trial account limitation: Phone number must be verified');
      console.error('❌ [SMS] Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
      errorMessage = `Phone number ${formattedPhone} is not verified. For trial accounts, you must verify the number first at https://console.twilio.com/us1/develop/phone-numbers/manage/verified. The OTP code is: ${otp}`;
    } else if (error.code === 21614) {
      errorMessage = 'Invalid phone number. Please check and try again.';
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

// Send urgent notice via SMS
const sendUrgentNotice = async (phoneNumber, noticeTitle) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log(`📱 [SMS] Urgent notice for ${formattedPhone}: ${noticeTitle}`);
      return { success: true, message: 'Urgent notice logged (Twilio not configured)' };
    }

    const message = await twilioClient.messages.create({
      body: `URGENT: ${noticeTitle}. Please check ApartmentSync app for details.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log(`✅ [SMS] Urgent notice sent to ${formattedPhone}`);
    return { success: true, message: 'Urgent notice sent', sid: message.sid };
  } catch (error) {
    console.error('❌ [SMS] Urgent notice error:', error);
    return { 
      success: false, 
      message: 'Failed to send urgent notice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

// Send payment reminder via SMS
const sendPaymentReminder = async (phoneNumber, amount, dueDate) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log(`📱 [SMS] Payment reminder for ${formattedPhone}: ₹${amount} due ${dueDate}`);
      return { success: true, message: 'Payment reminder logged (Twilio not configured)' };
    }

    const message = await twilioClient.messages.create({
      body: `Reminder: Maintenance payment of ₹${amount} is due on ${dueDate}. Please pay via ApartmentSync app.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log(`✅ [SMS] Payment reminder sent to ${formattedPhone}`);
    return { success: true, message: 'Payment reminder sent', sid: message.sid };
  } catch (error) {
    console.error('❌ [SMS] Payment reminder error:', error);
    return { 
      success: false, 
      message: 'Failed to send payment reminder',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

module.exports = {
  sendOTP,
  sendUrgentNotice,
  sendPaymentReminder,
  formatPhoneNumber // Export for testing/utility purposes
};