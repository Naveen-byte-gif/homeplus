const mongoose = require('mongoose');

// UPI ID subdocument for multiple UPI IDs support
const upiIdSchema = new mongoose.Schema({
  upiId: {
    type: String,
    required: [true, 'UPI ID is required'],
    trim: true,
    lowercase: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Please enter a valid UPI ID']
  },
  accountHolderName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const upiConfigSchema = new mongoose.Schema({
  apartmentCode: {
    type: String,
    required: [true, 'Apartment code is required'],
    unique: true,
    uppercase: true,
    index: true
  },
  // Array of UPI IDs - support multiple banks
  upiIds: {
    type: [upiIdSchema],
    default: [],
    validate: {
      validator: function(upiIds) {
        // At least one active UPI ID required if enabled
        if (this.isEnabled && upiIds.length > 0) {
          return upiIds.some(id => id.isActive);
        }
        return true;
      },
      message: 'At least one active UPI ID is required when enabled'
    }
  },
  // Legacy single UPI ID (for backward compatibility)
  upiId: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Please enter a valid UPI ID']
  },
  accountHolderName: {
    type: String,
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  qrCodeImage: {
    url: String,
    publicId: String
  },
  defaultPaymentNoteFormat: {
    type: String,
    default: 'INV-{invoiceNumber} | Flat {flatNumber}',
    trim: true
  },
  isEnabled: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by is required']
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Virtual to get active UPI ID
upiConfigSchema.virtual('activeUpiId').get(function() {
  const activeId = this.upiIds.find(id => id.isActive);
  if (activeId) {
    return {
      upiId: activeId.upiId,
      accountHolderName: activeId.accountHolderName,
      bankName: activeId.bankName
    };
  }
  // Fallback to legacy single UPI ID
  if (this.upiId) {
    return {
      upiId: this.upiId,
      accountHolderName: this.accountHolderName,
      bankName: this.bankName
    };
  }
  return null;
});

// Method to format payment note (short format, max 25-30 chars for UPI)
// Format: "INV-102 | Flat 102" (exactly as specified)
upiConfigSchema.methods.formatPaymentNote = function(invoiceNumber, flatNumber) {
  // Extract short invoice number (remove long prefixes if present)
  let shortInvNum = invoiceNumber;
  
  // If invoice number is too long, extract the last part after last dash
  if (invoiceNumber && invoiceNumber.includes('-')) {
    const parts = invoiceNumber.split('-');
    // Use last meaningful part (usually the sequence number)
    if (parts.length > 1) {
      // Try to use last 2 parts
      shortInvNum = parts.slice(-2).join('-');
      // If still too long, use just the last part
      if (shortInvNum.length > 10) {
        shortInvNum = parts[parts.length - 1];
      }
    }
  }
  
  // Format: "INV-102 | Flat 102" - keep it short and clean
  let note = '';
  if (flatNumber && flatNumber.trim()) {
    note = `INV-${shortInvNum} | Flat ${flatNumber}`;
  } else {
    note = `INV-${shortInvNum}`;
  }
  
  // Enforce max 30 characters (UPI security requirement)
  if (note.length > 30) {
    // Try shorter format: "INV-102 | F102"
    if (flatNumber && flatNumber.trim()) {
      note = `INV-${shortInvNum} | F${flatNumber}`;
    } else {
      note = `INV-${shortInvNum}`;
    }
  }
  
  // Final fallback - just invoice number
  if (note.length > 30) {
    note = `INV-${shortInvNum.substring(0, 10)}`; // Max 13 chars
  }
  
  return note;
};

// Method to generate UPI deep link with ONLY required parameters
upiConfigSchema.methods.generateUpiDeepLink = function(amount, note) {
  // UPI deep link format with ONLY required params: pa, pn, am, cu, tn
  // pa = Payee Address (UPI ID) - ANY valid bank handle
  // pn = Payee Name (Account holder name)
  // am = Amount (minimum ₹10)
  // cu = Currency (INR)
  // tn = Transaction Note (short reference, max 30 chars)
  
  const activeUpi = this.activeUpiId;
  if (!activeUpi) {
    throw new Error('No active UPI ID configured');
  }
  
  // Ensure note is max 30 characters
  const shortNote = (note || '').substring(0, 30);
  
  const encodedNote = encodeURIComponent(shortNote);
  const encodedPayeeName = encodeURIComponent(activeUpi.accountHolderName || '');
  const encodedUpiId = encodeURIComponent(activeUpi.upiId);
  
  return `upi://pay?pa=${encodedUpiId}&pn=${encodedPayeeName}&am=${amount.toFixed(2)}&cu=INR&tn=${encodedNote}`;
};

// Method to get QR code data string (same format as deep link for consistency)
upiConfigSchema.methods.generateQrCodeString = function(amount, note) {
  const activeUpi = this.activeUpiId;
  if (!activeUpi) {
    throw new Error('No active UPI ID configured');
  }
  
  // Ensure note is max 30 characters (UPI security requirement)
  const shortNote = (note || '').substring(0, 30);
  
  // Encode all parameters properly
  const encodedNote = encodeURIComponent(shortNote);
  const encodedPayeeName = encodeURIComponent(activeUpi.accountHolderName || '');
  const encodedUpiId = encodeURIComponent(activeUpi.upiId);
  
  // QR code uses same format as deep link
  return `upi://pay?pa=${encodedUpiId}&pn=${encodedPayeeName}&am=${amount.toFixed(2)}&cu=INR&tn=${encodedNote}`;
};

module.exports = mongoose.model('UpiConfig', upiConfigSchema);

