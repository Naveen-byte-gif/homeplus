const mongoose = require('mongoose');
const User = require('./User');

const apartmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Apartment name is required'],
    trim: true,
    unique: true
  },
  code: {
    type: String,
    required: [true, 'Apartment code is required'],
    uppercase: true,
    unique: true
  },
  // Basic Building Information
  buildingCategory: {
    type: String,
    enum: ['Residential', 'Commercial', 'Mixed Use'],
    default: 'Residential'
  },
  buildingType: {
    type: String,
    enum: ['Apartment', 'Independent Building', 'Villa Block', 'Gated Community'],
    default: 'Apartment'
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  contact: {
    phone: String,
    email: String,
    managerName: String
  },
  // Structural Details
  structuralDetails: {
    constructionType: {
      type: String,
      enum: ['RCC', 'Load Bearing', 'Steel', 'Precast'],
      default: 'RCC'
    },
    totalPlotArea: {
      value: Number,
      unit: { type: String, enum: ['sq.yd', 'sq.m'], default: 'sq.yd' }
    },
    totalBuiltUpArea: {
      value: Number,
      unit: { type: String, enum: ['sq.ft', 'sq.m'], default: 'sq.ft' }
    },
    numberOfBlocks: { type: Number, default: 1 },
    numberOfBasements: { type: Number, default: 0 },
    constructionStartDate: Date,
    constructionCompletionDate: Date,
    buildingAge: Number // Auto-calculated
  },
  // Safety & Compliance
  safetyCompliance: {
    fireSafetyNOC: {
      hasNOC: { type: Boolean, default: false },
      nocNumber: String,
      expiryDate: Date
    },
    liftSafetyCertificate: {
      hasCertificate: { type: Boolean, default: false },
      certificateNumber: String,
      expiryDate: Date
    },
    structuralStabilityCertificate: {
      hasCertificate: { type: Boolean, default: false },
      certificateNumber: String,
      expiryDate: Date
    }
  },
  // Utilities & Infrastructure
  utilities: {
    waterSource: {
      type: [String],
      enum: ['Municipal', 'Borewell', 'Tanker'],
      default: ['Municipal']
    },
    electricityConnection: {
      type: String,
      enum: ['Individual Meters', 'Common Meter'],
      default: 'Individual Meters'
    },
    sewageSystem: {
      type: String,
      enum: ['Underground Drainage', 'Septic Tank', 'STP'],
      default: 'Underground Drainage'
    },
    powerBackup: {
      type: String,
      enum: ['Generator', 'UPS', 'None'],
      default: 'None'
    },
    rainWaterHarvesting: { type: Boolean, default: false }
  },
  // Parking
  parking: {
    totalParkingSlots: { type: Number, default: 0 },
    parkingType: {
      type: [String],
      enum: ['Covered', 'Open', 'Mechanical'],
      default: ['Open']
    },
    twoWheelerParking: { type: Boolean, default: true },
    fourWheelerParking: { type: Boolean, default: true }
  },
  // Common Amenities
  amenities: {
    type: [String],
    enum: [
      'Lift',
      'CCTV',
      'Security Room',
      'Intercom',
      'Garbage Area',
      'Visitor Parking',
      'Fire Safety Equipment',
      'Gym',
      'Swimming Pool',
      'Clubhouse',
      'Playground',
      'Garden',
      'Park'
    ],
    default: []
  },
  configuration: {
    totalFloors: { type: Number, default: 5 },
    flatsPerFloor: { type: Number, default: 4 },
    floors: [{
      floorNumber: { type: Number, required: true },
      flats: [{
        flatNumber: { type: String, required: true },
        flatCode: { type: String, required: true }, // Generated based on building name and flat number
        flatType: { 
          type: String, 
          enum: ['1BHK', '2BHK', '3BHK', '4BHK', 'Duplex', 'Penthouse'],
          required: true 
        },
        squareFeet: Number,
        isOccupied: { type: Boolean, default: false },
        occupiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      }]
    }]
  },
  settings: {
    maintenanceRate: { type: Number, required: true }, // per sq.ft
    lateFeePercentage: { type: Number, default: 2 },
    gracePeriod: { type: Number, default: 15 }, // days
    emergencyContacts: [{
      name: String,
      phone: String,
      role: String
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
apartmentSchema.index({ code: 1 }, { unique: true });
apartmentSchema.index({ 'address.city': 1, 'address.state': 1 });

// Static method to find apartment by code
apartmentSchema.statics.findByCode = function(code) {
  try {
    if (!code) {
      console.log('⚠️ findByCode called with null/undefined code');
      return null;
    }
    
    if (typeof code !== 'string') {
      console.log(`⚠️ findByCode called with non-string code: ${typeof code}`, code);
      return null;
    }
    
    const upperCode = code.toUpperCase().trim();
    console.log(`🔍 Searching for apartment with code: ${upperCode}`);
    
    return this.findOne({ code: upperCode, isActive: true });
  } catch (error) {
    console.error('❌ Error in findByCode:', error);
    console.error('Code value:', code);
    console.error('Code type:', typeof code);
    return null;
  }
};

// Method to check if flat exists
apartmentSchema.methods.flatExists = function(floorNumber, flatNumber) {
  // Convert floorNumber to number if it's a string
  const floorNum = typeof floorNumber === 'string' ? parseInt(floorNumber) : floorNumber;
  console.log(`🔍 [MODEL] Checking flat existence: Floor ${floorNum} (type: ${typeof floorNum}), Flat ${flatNumber}`);
  
  const floor = this.configuration.floors.find(f => f.floorNumber === floorNum);
  if (!floor) {
    console.log(`❌ [MODEL] Floor ${floorNum} not found`);
    return false;
  }
  
  const exists = floor.flats.some(flat => flat.flatNumber === flatNumber);
  console.log(`${exists ? '✅' : '❌'} [MODEL] Flat ${flatNumber} ${exists ? 'exists' : 'not found'} on floor ${floorNum}`);
  return exists;
};

// Method to get flat details
apartmentSchema.methods.getFlatDetails = function(floorNumber, flatNumber) {
  // Convert floorNumber to number if it's a string
  const floorNum = typeof floorNumber === 'string' ? parseInt(floorNumber) : floorNumber;
  console.log(`🔍 [MODEL] Getting flat details: Floor ${floorNum}, Flat ${flatNumber}`);
  
  const floor = this.configuration.floors.find(f => f.floorNumber === floorNum);
  if (!floor) {
    console.log(`❌ [MODEL] Floor ${floorNum} not found`);
    return null;
  }
  
  const flat = floor.flats.find(flat => flat.flatNumber === flatNumber);
  if (flat) {
    console.log(`✅ [MODEL] Found flat: ${JSON.stringify(flat)}`);
  } else {
    console.log(`❌ [MODEL] Flat ${flatNumber} not found on floor ${floorNum}`);
  }
  return flat;
};

// Method to mark flat as occupied
apartmentSchema.methods.markFlatOccupied = function(floorNumber, flatNumber, userId) {
  // Convert floorNumber to number if it's a string
  const floorNum = typeof floorNumber === 'string' ? parseInt(floorNumber) : floorNumber;
  console.log(`🏠 [MODEL] Marking flat as occupied: Floor ${floorNum}, Flat ${flatNumber}, User: ${userId}`);
  
  const floor = this.configuration.floors.find(f => f.floorNumber === floorNum);
  if (!floor) {
    console.log(`❌ [MODEL] Floor ${floorNum} not found`);
    return false;
  }
  
  const flat = floor.flats.find(f => f.flatNumber === flatNumber);
  if (!flat) {
    console.log(`❌ [MODEL] Flat ${flatNumber} not found on floor ${floorNum}`);
    return false;
  }
  
  flat.isOccupied = true;
  flat.occupiedBy = userId;
  console.log(`✅ [MODEL] Flat ${flatNumber} marked as occupied`);
  return true;
};

// Method to mark flat as vacant
apartmentSchema.methods.markFlatVacant = function(floorNumber, flatNumber) {
  const floor = this.configuration.floors.find(f => f.floorNumber === floorNumber);
  if (!floor) return false;
  const flat = floor.flats.find(f => f.flatNumber === flatNumber);
  if (!flat) return false;
  flat.isOccupied = false;
  flat.occupiedBy = undefined;
  return true;
};

module.exports = mongoose.model('Apartment', apartmentSchema);