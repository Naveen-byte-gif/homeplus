const mongoose = require('mongoose');

// Generate random string
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Format phone number
const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  // Remove any non-digit characters and ensure it starts with +91
  const cleaned = phone.replace(/\D/g, '');
  return `+91${cleaned}`;
};

// Calculate SLA breach
const calculateSLABreach = (createdAt, expectedResolution, actualResolution) => {
  if (!actualResolution) return false;
  return actualResolution > expectedResolution;
};

// Pagination helper
const getPagination = (page, size) => {
  const limit = size ? +size : 10;
  const offset = page ? (page - 1) * limit : 0;
  return { limit, offset };
};

// Filter helper for complaints
const buildComplaintFilter = (filters) => {
  const filter = {};
  
  if (filters.status) filter.status = filters.status;
  if (filters.category) filter.category = filters.category;
  if (filters.priority) filter.priority = filters.priority;
  if (filters.wing) filter['location.wing'] = filters.wing;
  
  if (filters.dateFrom || filters.dateTo) {
    filter.createdAt = {};
    if (filters.dateFrom) filter.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) filter.createdAt.$lte = new Date(filters.dateTo);
  }
  
  return filter;
};

module.exports = {
  generateRandomString,
  isValidObjectId,
  formatPhoneNumber,
  calculateSLABreach,
  getPagination,
  buildComplaintFilter
};