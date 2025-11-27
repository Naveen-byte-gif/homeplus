const mongoose = require('mongoose');

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
  configuration: {
    totalTowers: { type: Number, required: true },
    floorsPerTower: { type: Number, required: true },
    flatsPerFloor: { type: Number, required: true },
    wings: [{
      name: { type: String, required: true },
      towers: [{
        name: { type: String, required: true },
        floors: [{
          number: { type: Number, required: true },
          flats: [{
            number: { type: String, required: true },
            type: { 
              type: String, 
              enum: ['1BHK', '2BHK', '3BHK', '4BHK', 'Duplex', 'Penthouse'],
              required: true 
            },
            squareFeet: Number,
            isOccupied: { type: Boolean, default: false }
          }]
        }]
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
  return this.findOne({ code: code.toUpperCase(), isActive: true });
};

// Method to check if flat exists
apartmentSchema.methods.flatExists = function(wing, flatNumber) {
  return this.configuration.wings.some(w => 
    w.name === wing && 
    w.towers.some(t => 
      t.floors.some(f => 
        f.flats.some(flat => flat.number === flatNumber)
      )
    )
  );
};

module.exports = mongoose.model('Apartment', apartmentSchema);