const mongoose = require('mongoose');

// Validate Indian phone number
const isValidIndianPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
const isStrongPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Validate apartment code format
const isValidApartmentCode = (code) => {
  const codeRegex = /^[A-Z0-9]{3,10}$/;
  return codeRegex.test(code);
};

// Validate flat number format
const isValidFlatNumber = (flatNumber) => {
  const flatRegex = /^[A-Z0-9\-]{1,10}$/;
  return flatRegex.test(flatNumber);
};

// Validate wing/building format
const isValidWing = (wing) => {
  const wingRegex = /^[A-Z0-9]{1,5}$/;
  return wingRegex.test(wing);
};

// Validate floor number
const isValidFloorNumber = (floor) => {
  return Number.isInteger(floor) && floor >= 0 && floor <= 100;
};

// Validate complaint priority
const isValidComplaintPriority = (priority) => {
  const validPriorities = ['Low', 'Medium', 'High', 'Emergency'];
  return validPriorities.includes(priority);
};

// Validate complaint category
const isValidComplaintCategory = (category) => {
  const validCategories = [
    'Electrical', 'Plumbing', 'Carpentry', 'Painting', 
    'Cleaning', 'Security', 'Elevator', 'Common Area', 'Other'
  ];
  return validCategories.includes(category);
};

// Validate notice priority
const isValidNoticePriority = (priority) => {
  const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];
  return validPriorities.includes(priority);
};

// Validate notice category
const isValidNoticeCategory = (category) => {
  const validCategories = [
    'General', 'Maintenance', 'Security', 'Event', 'Emergency', 'Payment'
  ];
  return validCategories.includes(category);
};

// Validate date range
const isValidDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return start <= end;
};

// Validate file type for uploads
const isValidFileType = (fileName, allowedTypes) => {
  const extension = fileName.split('.').pop().toLowerCase();
  return allowedTypes.includes(extension);
};

// Validate file size
const isValidFileSize = (fileSize, maxSizeInMB) => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return fileSize <= maxSizeInBytes;
};

// Validate image dimensions
const isValidImageDimensions = (width, height, maxWidth, maxHeight) => {
  return width <= maxWidth && height <= maxHeight;
};

// Validate OTP format
const isValidOTP = (otp) => {
  const otpRegex = /^\d{6}$/;
  return otpRegex.test(otp);
};

// Validate amount (positive number with 2 decimal places)
const isValidAmount = (amount) => {
  const amountRegex = /^\d+(\.\d{1,2})?$/;
  return amountRegex.test(amount.toString()) && parseFloat(amount) > 0;
};

// Validate percentage (0-100)
const isValidPercentage = (percentage) => {
  return !isNaN(percentage) && percentage >= 0 && percentage <= 100;
};

// Validate coordinates (latitude and longitude)
const isValidCoordinates = (lat, lng) => {
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
};

// Validate pincode (Indian format)
const isValidPincode = (pincode) => {
  const pincodeRegex = /^\d{6}$/;
  return pincodeRegex.test(pincode);
};

// Validate user role
const isValidUserRole = (role) => {
  const validRoles = ['resident', 'staff', 'admin'];
  return validRoles.includes(role);
};

// Validate user status
const isValidUserStatus = (status) => {
  const validStatuses = ['pending', 'active', 'suspended', 'rejected'];
  return validStatuses.includes(status);
};

// Validate complaint status
const isValidComplaintStatus = (status) => {
  const validStatuses = [
    'Open', 'Assigned', 'In Progress', 'Resolved', 
    'Closed', 'Cancelled', 'Reopened'
  ];
  return validStatuses.includes(status);
};

// Validate notice status
const isValidNoticeStatus = (status) => {
  const validStatuses = ['Draft', 'Published', 'Expired', 'Archived'];
  return validStatuses.includes(status);
};

// Validate rating (1-5)
const isValidRating = (rating) => {
  return !isNaN(rating) && rating >= 1 && rating <= 5;
};

// Validate time format (HH:MM)
const isValidTime = (time) => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

// Validate date is not in the past
const isFutureDate = (date) => {
  return new Date(date) > new Date();
};

// Validate array of ObjectIds
const isValidObjectIdArray = (array) => {
  if (!Array.isArray(array)) return false;
  return array.every(id => isValidObjectId(id));
};

// Validate string length
const isValidStringLength = (str, min, max) => {
  return str.length >= min && str.length <= max;
};

// Validate numeric range
const isValidNumericRange = (num, min, max) => {
  return !isNaN(num) && num >= min && num <= max;
};

// Validate URL format
const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Validate base64 string
const isValidBase64 = (str) => {
  if (typeof str !== 'string') return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
};

// Validate JSON string
const isValidJSON = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  isValidIndianPhone,
  isValidEmail,
  isStrongPassword,
  isValidObjectId,
  isValidApartmentCode,
  isValidFlatNumber,
  isValidWing,
  isValidFloorNumber,
  isValidComplaintPriority,
  isValidComplaintCategory,
  isValidNoticePriority,
  isValidNoticeCategory,
  isValidDateRange,
  isValidFileType,
  isValidFileSize,
  isValidImageDimensions,
  isValidOTP,
  isValidAmount,
  isValidPercentage,
  isValidCoordinates,
  isValidPincode,
  isValidUserRole,
  isValidUserStatus,
  isValidComplaintStatus,
  isValidNoticeStatus,
  isValidRating,
  isValidTime,
  isFutureDate,
  isValidObjectIdArray,
  isValidStringLength,
  isValidNumericRange,
  isValidURL,
  isValidBase64,
  isValidJSON
};