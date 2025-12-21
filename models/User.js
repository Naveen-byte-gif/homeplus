const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number'],
    index: true
  },
  email: {
    type: String,
    sparse: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  profilePicture: {
    url: String,
    publicId: String
  },

  // Apartment Information
  apartmentCode: {
    type: String,
    required: function() {
      // Only required for non-admin roles
      return this.role && this.role !== 'admin';
    },
    uppercase: true,
    default: undefined
  },
  wing: {
    type: String,
    required: function() {
      return this.role === 'resident';
    },
    uppercase: true
  },
  flatNumber: {
    type: String,
    required: function() {
      return this.role === 'resident';
    },
    uppercase: true
  },
  flatCode: {
    type: String,
    required: function() {
      return this.role === 'resident';
    },
    uppercase: true
  },
  floorNumber: {
    type: Number,
    required: function() {
      return this.role === 'resident';
    },
    min: [0, 'Floor number cannot be negative']
  },
  flatType: {
    type: String,
    enum: ['1BHK', '2BHK', '3BHK', '4BHK', 'Duplex', 'Penthouse'],
    required: function() {
      return this.role === 'resident';
    }
  },
  // Timestamps for resident registration and updates
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  },

  // Account Information
  password: {
    type: String,
    required: [true, 'Password is required'],
    // Removed minlength validation - allow any password length
    select: false
  },
  role: {
    type: String,
    enum: ['resident', 'staff', 'admin'],
    default: 'resident'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'rejected'],
    default: 'pending'
  },
  isVerified: {
    type: Boolean,
    default: false
  },

  // Security
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,

  // Preferences
  notificationPreferences: {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: false }
  },
  
  // Firebase Cloud Messaging Token
  fcmToken: {
    type: String,
    default: null
  },

  // Presence tracking
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full address
userSchema.virtual('fullAddress').get(function() {
  return `${this.wing}-${this.flatNumber}, Floor ${this.floorNumber}`;
});

// Index for efficient queries
// Unique index only for residents (wing + flat combination)
userSchema.index({ apartmentCode: 1, wing: 1, flatNumber: 1 }, { 
  unique: true, 
  partialFilterExpression: { role: 'resident' }
});
userSchema.index({ status: 1, role: 1 });
userSchema.index({ apartmentCode: 1, role: 1 });

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method for password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Instance method for incrementing login attempts
userSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);