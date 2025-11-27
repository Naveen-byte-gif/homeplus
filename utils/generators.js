const crypto = require('crypto');

// Generate random OTP
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return otp;
};

// Generate unique ticket number for complaints
const generateTicketNumber = (prefix = 'APT') => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

// Generate employee ID for staff
const generateEmployeeId = (prefix = 'EMP') => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${timestamp}${random}`;
};

// Generate unique invoice number
const generateInvoiceNumber = (apartmentCode, month, year) => {
  const sequence = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `INV-${apartmentCode}-${year}${month.toString().padStart(2, '0')}-${sequence}`;
};

// Generate random password
const generateRandomPassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one of each required character type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special char
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

// Generate unique apartment code
const generateApartmentCode = (name) => {
  // Take first 3 letters of name and add random numbers
  const code = name.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${code}${random}`;
};

// Generate secure token for password reset
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate verification code for email verification
const generateVerificationCode = (length = 8) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  
  return code;
};

// Generate session ID
const generateSessionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Generate unique file name for uploads
const generateFileName = (originalName, prefix = 'file') => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const extension = originalName.split('.').pop();
  return `${prefix}_${timestamp}_${random}.${extension}`;
};

// Generate bulk operation ID
const generateBulkOperationId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `bulk_${timestamp}_${random}`;
};

// Generate chat room ID for user conversations
const generateChatRoomId = (userId1, userId2) => {
  const sortedIds = [userId1, userId2].sort();
  return `chat_${sortedIds[0]}_${sortedIds[1]}`;
};

// Generate notification ID
const generateNotificationId = () => {
  return `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
};

// Generate audit log ID
const generateAuditLogId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `audit_${timestamp}_${random}`;
};

// Generate report ID
const generateReportId = (type = 'report') => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${type}_${dateStr}_${random}`;
};

module.exports = {
  generateOTP,
  generateTicketNumber,
  generateEmployeeId,
  generateInvoiceNumber,
  generateRandomPassword,
  generateApartmentCode,
  generateSecureToken,
  generateVerificationCode,
  generateSessionId,
  generateFileName,
  generateBulkOperationId,
  generateChatRoomId,
  generateNotificationId,
  generateAuditLogId,
  generateReportId
};