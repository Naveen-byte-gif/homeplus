const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number']
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  purpose: {
    type: String,
    enum: ['registration', 'login', 'forgot-password', 'admin_registration'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 300 } // Auto delete after 5 minutes
  },
  attempts: {
    type: Number,
    default: 0
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
OTPSchema.index({ phoneNumber: 1, purpose: 1 });

// Static method to create OTP
OTPSchema.statics.generateOTP = async function(phoneNumber, purpose) {
  // Delete any existing OTPs for this phone and purpose
  await this.deleteMany({ phoneNumber, purpose });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set expiry to 5 minutes from now
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  return this.create({
    phoneNumber,
    otp,
    purpose,
    expiresAt
  });
};

// Static method to verify OTP
OTPSchema.statics.verifyOTP = async function(phoneNumber, otp, purpose) {
  const otpRecord = await this.findOne({
    phoneNumber,
    otp,
    purpose,
    expiresAt: { $gt: new Date() },
    isUsed: false
  });

  if (!otpRecord) {
    return { isValid: false, message: 'Invalid or expired OTP' };
  }

  if (otpRecord.attempts >= 3) {
    return { isValid: false, message: 'Too many failed attempts' };
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  return { isValid: true, message: 'OTP verified successfully' };
};

module.exports = mongoose.model('OTP', OTPSchema);