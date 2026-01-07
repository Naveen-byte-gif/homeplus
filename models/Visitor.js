const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  // Visitor Information
  visitorName: {
    type: String,
    required: [true, 'Visitor name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number']
  },
  email: {
    type: String,
    sparse: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  visitorPhoto: {
    url: String,
    publicId: String
  },
  visitorType: {
    type: String,
    required: [true, 'Visitor type is required'],
    enum: ['Guest', 'Delivery', 'Vendor', 'Cab / Ride', 'Domestic Help', 'Realtor / Sales', 'Emergency Services'],
    default: 'Guest'
  },

  // Location Information
  apartmentCode: {
    type: String,
    required: [true, 'Apartment code is required'],
    uppercase: true,
    index: true
  },
  building: {
    type: String,
    required: [true, 'Building/Block is required'],
    uppercase: true
  },
  flatNumber: {
    type: String,
    required: [true, 'Flat number is required'],
    uppercase: true
  },
  flatCode: {
    type: String,
    uppercase: true
  },
  floorNumber: {
    type: Number,
    required: [true, 'Floor number is required']
  },
  purpose: {
    type: String,
    trim: true,
    maxlength: [500, 'Purpose cannot exceed 500 characters']
  },

  // Host Information
  hostResident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Host resident is required']
  },

  // Entry Information
  status: {
    type: String,
    enum: ['Pending', 'Pre-Approved', 'Checked In', 'Checked Out', 'Rejected', 'Cancelled'],
    default: 'Pending',
    index: true
  },
  checkInTime: {
    type: Date
  },
  checkOutTime: {
    type: Date
  },
  expectedCheckOutTime: {
    type: Date
  },
  checkInMethod: {
    type: String,
    enum: ['Manual', 'QR Code', 'OTP', 'Pre-Approved'],
    default: 'Manual'
  },

  // Additional Information
  vehicleNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  carryingMaterial: {
    type: Boolean,
    default: false
  },
  numberOfVisitors: {
    type: Number,
    min: [1, 'Number of visitors must be at least 1'],
    default: 1
  },
  nightTimeAccess: {
    allowed: {
      type: Boolean,
      default: false
    },
    requiresApproval: {
      type: Boolean,
      default: true
    }
  },

  // Security Information
  qrCode: {
    code: String,
    generatedAt: Date,
    expiresAt: Date
  },
  otp: {
    code: String,
    generatedAt: Date,
    expiresAt: Date,
    attempts: {
      type: Number,
      default: 0
    }
  },

  // Approval Information
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },

  // Entry Creation Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Check-in/Check-out Information
  checkedInBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  checkedOutBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },

  // Timestamps
  entryDate: {
    type: Date,
    default: Date.now
  },
  exactTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
visitorSchema.index({ apartmentCode: 1, status: 1 });
visitorSchema.index({ hostResident: 1, status: 1 });
visitorSchema.index({ apartmentCode: 1, building: 1, flatNumber: 1 });
visitorSchema.index({ checkInTime: 1 });
visitorSchema.index({ entryDate: 1 });

// Virtual for duration inside
visitorSchema.virtual('durationInside').get(function() {
  if (this.checkInTime && this.checkOutTime) {
    return Math.floor((this.checkOutTime - this.checkInTime) / 1000 / 60); // minutes
  }
  if (this.checkInTime) {
    return Math.floor((Date.now() - this.checkInTime) / 1000 / 60); // minutes
  }
  return null;
});

// Virtual for isOverdue
visitorSchema.virtual('isOverdue').get(function() {
  if (this.status === 'Checked In' && this.expectedCheckOutTime) {
    return new Date() > this.expectedCheckOutTime;
  }
  return false;
});

// Pre-save middleware
visitorSchema.pre('save', function(next) {
  // Auto-generate flat code if not provided
  if (!this.flatCode && this.building && this.flatNumber) {
    this.flatCode = `${this.building}-${this.flatNumber}`;
  }
  next();
});

module.exports = mongoose.model('Visitor', visitorSchema);

