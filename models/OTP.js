const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: false, // Phone number is optional - all OTP flows now use email
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number']
  },
  email: {
    type: String,
    required: function() {
      // Email required for all purposes that use email-based OTP
      return ['registration', 'forgot-password', 'login', 'admin_registration', 'admin_user_creation'].includes(this.purpose);
    },
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  purpose: {
    type: String,
    enum: ['registration', 'login', 'forgot-password', 'admin_registration', 'admin_user_creation'],
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
OTPSchema.index({ email: 1, purpose: 1 });

// Static method to create OTP (supports both phone and email)
OTPSchema.statics.generateOTP = async function(identifier, purpose, identifierType = 'phone') {
  // identifierType: 'phone' or 'email'
  const query = { purpose };
  
  if (identifierType === 'email') {
    query.email = identifier.toLowerCase().trim();
    // Delete any existing OTPs for this email and purpose
    await this.deleteMany({ email: query.email, purpose });
  } else {
    query.phoneNumber = identifier;
    // Delete any existing OTPs for this phone and purpose
    await this.deleteMany({ phoneNumber: identifier, purpose });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set expiry to 10 minutes from now (increased for email)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const otpData = {
    otp,
    purpose,
    expiresAt
  };

  if (identifierType === 'email') {
    otpData.email = query.email;
  } else {
    otpData.phoneNumber = query.phoneNumber;
  }

  return this.create(otpData);
};

// Static method to verify OTP (supports both phone and email)
OTPSchema.statics.verifyOTP = async function(identifier, otp, purpose, identifierType = 'phone') {
  const query = {
    otp,
    purpose,
    expiresAt: { $gt: new Date() },
    isUsed: false
  };

  if (identifierType === 'email') {
    query.email = identifier.toLowerCase().trim();
  } else {
    query.phoneNumber = identifier;
  }

  const otpRecord = await this.findOne(query);

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