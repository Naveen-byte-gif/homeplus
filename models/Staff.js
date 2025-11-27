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
  }
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