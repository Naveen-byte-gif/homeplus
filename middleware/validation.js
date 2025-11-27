const Joi = require('joi');
const { Types } = require('mongoose');

// Custom Joi validators
const objectId = Joi.string().custom((value, helpers) => {
  if (!Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation');

// Send OTP validation (for /send-otp route)
const validateSendOTP = (req, res, next) => {
  const schema = Joi.object({
    phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
      'string.pattern.base': 'Please provide a valid Indian phone number',
      'any.required': 'Phone number is required'
    }),
    purpose: Joi.string().valid('registration', 'login', 'forgot-password').required().messages({
      'any.required': 'Purpose is required',
      'any.only': 'Purpose must be registration, login, or forgot-password'
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// Verify OTP validation (for /verify-otp-login route)
const validateOTP = (req, res, next) => {
  const schema = Joi.object({
    phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
      'string.pattern.base': 'Please provide a valid Indian phone number',
      'any.required': 'Phone number is required'
    }),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'OTP must be 6 digits',
      'string.pattern.base': 'OTP must contain only numbers',
      'any.required': 'OTP is required'
    }),
    purpose: Joi.string().valid('registration', 'login', 'forgot-password').required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// Verify OTP and Register validation
const validateOTPAndRegister = (req, res, next) => {
  const schema = Joi.object({
    phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    userData: Joi.object({
      fullName: Joi.string().min(2).max(100).required().trim(),
      email: Joi.string().email().optional().allow(''),
      apartmentCode: Joi.string().required().uppercase().trim(),
      wing: Joi.string().required().uppercase().trim(),
      flatNumber: Joi.string().required().uppercase().trim(),
      floorNumber: Joi.number().integer().min(0).required(),
      flatType: Joi.string().valid('1BHK', '2BHK', '3BHK', '4BHK', 'Duplex', 'Penthouse').required(),
      password: Joi.string().min(8).required()
    }).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// Password login validation
const validatePasswordLogin = (req, res, next) => {
  const schema = Joi.object({
    phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
      'string.pattern.base': 'Please provide a valid Indian phone number',
      'any.required': 'Phone number is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// User registration validation
const validateUserRegistration = (req, res, next) => {
  const schema = Joi.object({
    fullName: Joi.string().min(2).max(100).required().trim(),
    phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    email: Joi.string().email().optional().allow(''),
    apartmentCode: Joi.string().required().uppercase().trim(),
    wing: Joi.string().required().uppercase().trim(),
    flatNumber: Joi.string().required().uppercase().trim(),
    floorNumber: Joi.number().integer().min(0).required(),
    flatType: Joi.string().valid('1BHK', '2BHK', '3BHK', '4BHK', 'Duplex', 'Penthouse').required(),
    password: Joi.string().min(8).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
    acceptTerms: Joi.boolean().valid(true).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// Complaint creation validation
const validateComplaintCreation = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().max(100).required().trim(),
    description: Joi.string().max(500).required().trim(),
    category: Joi.string().valid(
      'Electrical', 'Plumbing', 'Carpentry', 'Painting', 
      'Cleaning', 'Security', 'Elevator', 'Common Area', 'Other'
    ).required(),
    subCategory: Joi.string().required().trim(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Emergency').default('Medium'),
    location: Joi.object({
      specificLocation: Joi.string().required().trim(),
      accessInstructions: Joi.string().allow('').optional()
    }).required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

// Notice creation validation
const validateNoticeCreation = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().max(200).required().trim(),
    content: Joi.string().required(),
    category: Joi.string().valid('General', 'Maintenance', 'Security', 'Event', 'Emergency', 'Payment').required(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').default('Medium'),
    targetAudience: Joi.object({
      type: Joi.string().valid('All', 'Specific').required(),
      wings: Joi.array().items(Joi.string()).optional(),
      floors: Joi.array().items(Joi.number()).optional(),
      flatNumbers: Joi.array().items(Joi.string()).optional()
    }).required(),
    schedule: Joi.object({
      publishAt: Joi.date().optional(),
      expireAt: Joi.date().optional()
    }).optional(),
    requiresAcknowledgement: Joi.boolean().default(false)
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

module.exports = {
  validateSendOTP,
  validateOTP,
  validateOTPAndRegister,
  validatePasswordLogin,
  validateUserRegistration,
  validateComplaintCreation,
  validateNoticeCreation,
  objectId
};