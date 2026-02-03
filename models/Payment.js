const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: false, // Optional - invoice generated after payment
    index: true
  },
  flatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional - can use phone number instead
    index: true
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number'],
    index: true,
    required: false // Optional - can use flatId instead
  },
  apartmentCode: {
    type: String,
    required: [true, 'Apartment code is required'],
    uppercase: true,
    index: true
  },
  invoiceNumber: {
    type: String,
    required: false, // Will be generated after payment confirmation
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0.01, 'Payment amount must be greater than 0']
  },
  paymentPurpose: {
    type: String,
    enum: ['Maintenance', 'Water', 'Other'],
    default: 'Maintenance',
    required: [true, 'Payment purpose is required']
  },
  description: {
    type: String,
    trim: true
  },
  upiReferenceId: {
    type: String,
    trim: true,
    index: true
  },
  paymentDate: {
    type: Date,
    required: [true, 'Payment date is required'],
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending_verification', 'approved', 'rejected'],
    default: 'pending_verification',
    index: true
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: {
    type: Date
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  receiptPdfUrl: {
    type: String
  },
  transactionNote: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
paymentSchema.index({ flatId: 1, status: 1 });
paymentSchema.index({ apartmentCode: 1, status: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ upiReferenceId: 1 }, { sparse: true });

// Pre-save middleware to validate and generate receipt number
paymentSchema.pre('save', function(next) {
  // Validate that either flatId or phoneNumber is provided
  if (!this.flatId && !this.phoneNumber) {
    return next(new Error('Either flatId or phoneNumber must be provided'));
  }
  
  // Generate receipt number if new payment
  if (this.isNew && !this.receiptNumber) {
    // Generate receipt number: REC-YYYYMMDD-XXXXX
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    this.receiptNumber = `REC-${dateStr}-${random}`;
  }
  
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);

