const twilio = require('twilio');

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Send OTP via SMS
const sendOTP = async (phoneNumber, otp) => {
  try {
    if (!twilioClient || process.env.NODE_ENV !== 'production') {
      console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
      return { success: true, message: 'OTP logged for development' };
    }

    const message = await twilioClient.messages.create({
      body: `Your ApartmentSync verification code is: ${otp}. This code will expire in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${phoneNumber}`
    });

    console.log(`✅ OTP sent to ${phoneNumber}, SID: ${message.sid}`);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ SMS sending error:', error);
    return { success: false, message: 'Failed to send OTP' };
  }
};

// Send urgent notice via SMS
const sendUrgentNotice = async (phoneNumber, noticeTitle) => {
  try {
    if (!twilioClient || process.env.NODE_ENV !== 'production') {
      console.log(`📱 Urgent notice for ${phoneNumber}: ${noticeTitle}`);
      return { success: true, message: 'Urgent notice logged for development' };
    }

    const message = await twilioClient.messages.create({
      body: `URGENT: ${noticeTitle}. Please check ApartmentSync app for details.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${phoneNumber}`
    });

    console.log(`✅ Urgent notice sent to ${phoneNumber}`);
    return { success: true, message: 'Urgent notice sent' };
  } catch (error) {
    console.error('❌ Urgent notice SMS error:', error);
    return { success: false, message: 'Failed to send urgent notice' };
  }
};

// Send payment reminder via SMS
const sendPaymentReminder = async (phoneNumber, amount, dueDate) => {
  try {
    if (!twilioClient || process.env.NODE_ENV !== 'production') {
      console.log(`📱 Payment reminder for ${phoneNumber}: ₹${amount} due ${dueDate}`);
      return { success: true, message: 'Payment reminder logged for development' };
    }

    const message = await twilioClient.messages.create({
      body: `Reminder: Maintenance payment of ₹${amount} is due on ${dueDate}. Please pay via ApartmentSync app.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${phoneNumber}`
    });

    console.log(`✅ Payment reminder sent to ${phoneNumber}`);
    return { success: true, message: 'Payment reminder sent' };
  } catch (error) {
    console.error('❌ Payment reminder SMS error:', error);
    return { success: false, message: 'Failed to send payment reminder' };
  }
};

module.exports = {
  sendOTP,
  sendUrgentNotice,
  sendPaymentReminder
};