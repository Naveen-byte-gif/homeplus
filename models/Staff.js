const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  specialization: [{
    category: {
      type: String,
      enum: ['Electrical', 'Plumbing', 'Carpentry', 'Painting', 'Cleaning', 'Security', 'Elevator']
    },
    expertiseLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Expert'],
      default: 'Intermediate'
    }
  }],
  serviceAreas: [{
    wing: String,
    floors: [Number]
  }],
  // Assigned buildings with access control
  assignedBuildings: [{
    buildingCode: { type: String, required: true, uppercase: true },
    buildingName: String,
    isPrimary: { type: Boolean, default: false },
    assignedAt: { type: Date, default: Date.now }
  }],
  // Identity verification
  identityVerification: {
    idProofType: {
      type: String,
      enum: ['Aadhar', 'PAN', 'Driving License', 'Passport', 'Voter ID', 'Other']
    },
    idProofNumber: String,
    idProofDocument: {
      url: String,
      publicId: String
    },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected'],
      default: 'Pending'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    rejectionReason: String
  },
  // Emergency contact information
  emergencyContact: {
    name: String,
    relationship: {
      type: String,
      enum: ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Other']
    },
    phoneNumber: String,
    alternatePhoneNumber: String,
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String
    }
  },
  // Permissions and access control
  permissions: {
    canManageVisitors: { type: Boolean, default: false },
    canManageComplaints: { type: Boolean, default: false },
    canManageMaintenance: { type: Boolean, default: false },
    canAccessReports: { type: Boolean, default: false },
    canManageAccess: { type: Boolean, default: false },
    allowedActions: [{
      type: String,
      enum: ['check_in_visitor', 'check_out_visitor', 'create_visitor', 'update_visitor', 
             'assign_complaint', 'update_complaint', 'close_complaint', 'view_reports']
    }],
    restrictedAreas: [{
      buildingCode: String,
      floors: [Number],
      wings: [String]
    }]
  },
  availability: {
    schedule: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean }
    },
    currentStatus: {
      type: String,
      enum: ['Available', 'Busy', 'On Break', 'Offline'],
      default: 'Available'
    },
    nextAvailable: Date
  },
  performance: {
    totalComplaints: { type: Number, default: 0 },
    resolvedComplaints: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    averageResolutionTime: { type: Number, default: 0 }, // in hours
    slaCompliance: { type: Number, default: 0 } // percentage
  },
  currentWorkload: {
    activeComplaints: { type: Number, default: 0 },
    maxCapacity: { type: Number, default: 10 }
  },
  documents: [{
    type: { type: String, required: true },
    documentNumber: String,
    file: { url: String, publicId: String },
    expiryDate: Date,
    isVerified: { type: Boolean, default: false }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  onboardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  onboardedAt: Date
}, {
  timestamps: true
});

// Indexes
staffSchema.index({ employeeId: 1 }, { unique: true });
staffSchema.index({ specialization: 1 });
staffSchema.index({ 'availability.currentStatus': 1 });

// Virtual for completion rate
staffSchema.virtual('completionRate').get(function() {
  if (this.performance.totalComplaints === 0) return 0;
  return (this.performance.resolvedComplaints / this.performance.totalComplaints) * 100;
});

// Method to check availability
staffSchema.methods.isAvailable = function() {
  return this.availability.currentStatus === 'Available' && 
         this.currentWorkload.activeComplaints < this.currentWorkload.maxCapacity;
};

// Static method to find available staff by specialization
staffSchema.statics.findAvailableBySpecialization = function(category) {
  return this.find({
    'specialization.category': category,
    'availability.currentStatus': 'Available',
    'currentWorkload.activeComplaints': { $lt: '$currentWorkload.maxCapacity' },
    isActive: true
  }).populate('user', 'fullName phoneNumber profilePicture');
};

module.exports = mongoose.model('Staff', staffSchema);