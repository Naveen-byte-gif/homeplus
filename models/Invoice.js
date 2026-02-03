const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Item amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  description: {
    type: String,
    trim: true
  }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    index: true
  },
  flatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Flat ID is required'],
    index: true
  },
  apartmentCode: {
    type: String,
    required: [true, 'Apartment code is required'],
    uppercase: true,
    index: true
  },
  building: {
    type: String,
    required: [true, 'Building is required']
  },
  flatNumber: {
    type: String,
    required: [true, 'Flat number is required']
  },
  floor: {
    type: Number,
    required: false,
    default: 0
  },
  billingPeriod: {
    startDate: {
      type: Date,
      required: [true, 'Billing period start date is required']
    },
    endDate: {
      type: Date,
      required: [true, 'Billing period end date is required']
    }
  },
  items: {
    type: [invoiceItemSchema],
    required: [true, 'Invoice items are required'],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'Invoice must have at least one item'
    }
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  previousDues: {
    type: Number,
    default: 0,
    min: [0, 'Previous dues cannot be negative']
  },
  lateFee: {
    type: Number,
    default: 0,
    min: [0, 'Late fee cannot be negative']
  },
  totalPayable: {
    type: Number,
    required: [true, 'Total payable is required'],
    min: [0, 'Total payable cannot be negative']
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  status: {
    type: String,
    enum: ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'],
    default: 'pending',
    index: true
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  outstandingAmount: {
    type: Number,
    default: function() {
      return this.totalPayable;
    },
    min: [0, 'Outstanding amount cannot be negative']
  },
  notes: {
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
invoiceSchema.index({ flatId: 1, status: 1 });
invoiceSchema.index({ apartmentCode: 1, status: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate outstanding amount
invoiceSchema.pre('save', function(next) {
  this.outstandingAmount = this.totalPayable - this.paidAmount;
  
  // Update status based on payment
  if (this.paidAmount === 0) {
    if (new Date() > this.dueDate && this.status !== 'cancelled') {
      this.status = 'overdue';
    } else if (this.status !== 'cancelled') {
      this.status = 'pending';
    }
  } else if (this.paidAmount >= this.totalPayable) {
    this.status = 'paid';
    this.outstandingAmount = 0;
  } else {
    this.status = 'partially_paid';
  }
  
  this.updatedAt = Date.now();
  next();
});

// Method to calculate late fee
invoiceSchema.methods.calculateLateFee = function() {
  if (this.status === 'paid' || this.status === 'cancelled') {
    return 0;
  }
  
  const today = new Date();
  const daysOverdue = Math.floor((today - this.dueDate) / (1000 * 60 * 60 * 24));
  
  if (daysOverdue > 0) {
    // Example: ₹50 per day late fee (can be configured)
    return daysOverdue * 50;
  }
  
  return 0;
};

module.exports = mongoose.model('Invoice', invoiceSchema);

