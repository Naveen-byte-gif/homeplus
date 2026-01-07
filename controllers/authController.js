  const User = require('../models/User');
  const OTP = require('../models/OTP');
  const Apartment = require('../models/Apartment');
  const { generateToken } = require('../middleware/auth');
  const { sendOTP: sendSMSOTP } = require('../services/smsService');
  const { sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
  const { emitToUser } = require('../services/socketService');

  // @desc    Send OTP for registration/login
  // @route   POST /api/auth/send-otp
  // @access  Public
  const sendOTP = async (req, res) => {
    try {
      console.log('📨 [AUTH] Send OTP request received');
      console.log('📨 [AUTH] Request body:', JSON.stringify(req.body, null, 2));
      
      const { phoneNumber, purpose, email } = req.body;

      console.log(`📱 [AUTH] Phone: ${phoneNumber || 'not provided'}, Purpose: ${purpose}, Email: ${email || 'not provided'}`);
      
      // For registration: require email, skip phone
      if (purpose === 'registration') {
        if (!email || !email.trim()) {
          console.log('❌ [AUTH] Email is required for registration');
          return res.status(400).json({
            success: false,
            message: 'Email is required for registration'
          });
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        const trimmedEmail = email.trim().toLowerCase();
        if (!emailRegex.test(trimmedEmail)) {
          console.log('❌ [AUTH] Invalid email format');
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid email address'
          });
        }
        console.log('✅ [AUTH] Email format valid');

        // Check if user already exists with this email
        console.log('🔍 [AUTH] Checking for existing user (registration)...');
        const existingUser = await User.findOne({ email: trimmedEmail });
        if (existingUser) {
          console.log('❌ [AUTH] User already exists with this email');
          return res.status(409).json({
            success: false,
            message: 'User already exists with this email address'
          });
        }
        console.log('✅ [AUTH] User does not exist - can register');
      } else if (purpose === 'forgot-password') {
        // For forgot-password: require email, skip phone
        if (!email || !email.trim()) {
          console.log('❌ [AUTH] Email is required for forgot password');
          return res.status(400).json({
            success: false,
            message: 'Email is required for forgot password'
          });
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        const trimmedEmail = email.trim().toLowerCase();
        if (!emailRegex.test(trimmedEmail)) {
          console.log('❌ [AUTH] Invalid email format');
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid email address'
          });
        }
        console.log('✅ [AUTH] Email format valid');

        // Check if user exists
        console.log('🔍 [AUTH] Checking for existing user (forgot password)...');
        const existingUser = await User.findOne({ email: trimmedEmail });
        if (!existingUser) {
          console.log('❌ [AUTH] No account found with this email');
          return res.status(404).json({
            success: false,
            message: 'No account found with this email address. Please register first.'
          });
        }
        
        // Check if account is active
        if (existingUser.status !== 'active') {
          console.log('❌ [AUTH] Account is not active');
          return res.status(403).json({
            success: false,
            message: 'Account is not active. Please contact support.'
          });
        }
        
        console.log(`✅ [AUTH] User found with email: ${existingUser._id}`);
      } else {
        // For other purposes (login, admin_registration): require email
        if (!email || !email.trim()) {
          console.log('❌ [AUTH] Email is required for login and admin registration');
          return res.status(400).json({
            success: false,
            message: 'Email is required for login and admin registration'
          });
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        const trimmedEmail = email.trim().toLowerCase();
        if (!emailRegex.test(trimmedEmail)) {
          console.log('❌ [AUTH] Invalid email format');
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid email address'
          });
        }
        console.log('✅ [AUTH] Email format valid');
      }

      // Check if admin already exists for admin registration
      if (purpose === 'admin_registration') {
        const trimmedEmail = email.trim().toLowerCase();
        console.log('🔍 [AUTH] Checking for existing admin (admin_registration)...');
        const existingAdmin = await User.findOne({ email: trimmedEmail, role: 'admin' });
        if (existingAdmin) {
          console.log('❌ [AUTH] Admin already exists');
          return res.status(409).json({
            success: false,
            message: 'Admin already exists with this email address'
          });
        }
        console.log('✅ [AUTH] Admin does not exist - can register');
      }

      // Check if user exists for login
      if (purpose === 'login') {
        const trimmedEmail = email.trim().toLowerCase();
        console.log('🔍 [AUTH] Checking for existing user (login)...');
        const user = await User.findOne({ email: trimmedEmail, status: 'active' });
        if (!user) {
          console.log('❌ [AUTH] User not found or not active');
          return res.status(404).json({
            success: false,
            message: 'No account found with this email address'
          });
        }
        console.log(`✅ [AUTH] User found: ${user._id}`);
      }

      // Generate and save OTP
      console.log('🔐 [AUTH] Generating OTP...');
      let otpRecord;
      let identifier;
      
      if (purpose === 'registration' || purpose === 'forgot-password') {
        // For registration and forgot-password: use email-based OTP
        const trimmedEmail = email.trim().toLowerCase();
        identifier = trimmedEmail;
        otpRecord = await OTP.generateOTP(trimmedEmail, purpose, 'email');
        console.log(`✅ [AUTH] Email-based OTP generated: ${otpRecord.otp}`);
        
        // Send OTP via Email ONLY (no SMS for registration/forgot-password)
        console.log(`📧 [AUTH] Sending OTP via Email to: ${trimmedEmail}`);
        try {
          const emailResult = await sendOTPEmail(trimmedEmail, otpRecord.otp, purpose);
          if (emailResult.success) {
            console.log(`✅ [AUTH] OTP Email sent successfully to ${trimmedEmail}`);
            console.log(`📧 [AUTH] Email Message ID: ${emailResult.messageId || 'N/A'}`);
          } else {
            console.error(`❌ [AUTH] Email sending failed: ${emailResult.message}`);
            return res.status(500).json({
              success: false,
              message: 'Failed to send OTP email. Please try again.'
            });
          }
        } catch (emailError) {
          console.error(`❌ [AUTH] Email sending error:`, emailError.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to send OTP email. Please try again.'
          });
        }
      } else {
        // For other purposes (login, admin_registration): use email-based OTP
        const trimmedEmail = email.trim().toLowerCase();
        identifier = trimmedEmail;
        otpRecord = await OTP.generateOTP(trimmedEmail, purpose, 'email');
        console.log(`✅ [AUTH] Email-based OTP generated: ${otpRecord.otp}`);
        
        // Send OTP via Email ONLY (no SMS for login/admin_registration)
        console.log(`📧 [AUTH] Sending OTP via Email to: ${trimmedEmail}`);
        try {
          const emailResult = await sendOTPEmail(trimmedEmail, otpRecord.otp, purpose);
          if (emailResult.success) {
            console.log(`✅ [AUTH] OTP Email sent successfully to ${trimmedEmail}`);
            console.log(`📧 [AUTH] Email Message ID: ${emailResult.messageId || 'N/A'}`);
          } else {
            console.error(`❌ [AUTH] Email sending failed: ${emailResult.message}`);
            return res.status(500).json({
              success: false,
              message: 'Failed to send OTP email. Please try again.'
            });
          }
        } catch (emailError) {
          console.error(`❌ [AUTH] Email sending error:`, emailError.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to send OTP email. Please try again.'
          });
        }
      }
      
      // In development, always log the OTP for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📧 [AUTH] OTP for ${identifier}: ${otpRecord.otp}`);
      }

      console.log('✅ [AUTH] OTP sent successfully');
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          email: identifier, // All purposes now use email
          purpose,
          // Don't send OTP in response in production
          ...(process.env.NODE_ENV !== 'production' && { otp: otpRecord.otp })
        }
      });

    } catch (error) {
      console.error('❌ [AUTH] Send OTP error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error sending OTP',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Verify OTP and register user
  // @route   POST /api/auth/verify-otp-register
  // @access  Public
  const verifyOTPAndRegister = async (req, res) => {
    try {
      console.log('📝 [AUTH] Registration request received');
      console.log('📝 [AUTH] Request body:', JSON.stringify(req.body, null, 2));
      console.log('📝 [AUTH] Request headers:', JSON.stringify(req.headers, null, 2));
      
      const { phoneNumber, email, otp, userData } = req.body;
      
      // Log userData details
      if (userData) {
        console.log('📝 [AUTH] UserData received:');
        console.log('📝 [AUTH] - fullName:', userData.fullName);
        console.log('📝 [AUTH] - email:', userData.email);
        console.log('📝 [AUTH] - role:', userData.role);
        console.log('📝 [AUTH] - apartmentCode:', userData.apartmentCode);
        console.log('📝 [AUTH] - password exists:', !!userData.password);
        console.log('📝 [AUTH] - password type:', typeof userData.password);
        console.log('📝 [AUTH] - password length:', userData.password ? String(userData.password).length : 'undefined');
        console.log('📝 [AUTH] - password value (first 5 chars):', userData.password ? String(userData.password).substring(0, Math.min(5, String(userData.password).length)) : 'undefined');
      }

      // For registration: require email, not phoneNumber
      const registrationEmail = email || (userData && userData.email);
      if (!registrationEmail || !registrationEmail.trim()) {
        console.log('❌ [AUTH] Email is required for registration');
        return res.status(400).json({
          success: false,
          message: 'Email is required for registration'
        });
      }

      // Validate required fields
      if (!otp || !userData) {
        console.log('❌ [AUTH] Missing required fields:', { 
          email: !!registrationEmail,
          otp: !!otp, 
          userData: !!userData 
        });
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: email, otp, and userData are required',
          details: {
            email: !!registrationEmail,
            otp: !!otp,
            userData: !!userData
          }
        });
      }

      // Validate userData structure
      if (!userData.fullName || !userData.role) {
        console.log('❌ [AUTH] Missing required userData fields:', {
          fullName: !!userData.fullName,
          role: !!userData.role
        });
        return res.status(400).json({
          success: false,
          message: 'Missing required user data fields: fullName and role are required',
          details: {
            fullName: !!userData.fullName,
            role: !!userData.role
          }
        });
      }
      
      // Log password info for debugging (but don't validate length)
      console.log('🔐 [AUTH] Password info:', {
        exists: !!userData.password,
        type: typeof userData.password,
        length: userData.password ? userData.password.length : 0
      });

      console.log('✅ All required fields present');
      console.log('User data:', JSON.stringify(userData, null, 2));

      // Validate role
      const role = userData.role || 'resident';
      console.log(`👤 User role: ${role}`);
      
      if (!['resident', 'staff', 'admin'].includes(role)) {
        console.log(`❌ Invalid role: ${role}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be resident, staff, or admin'
        });
      }

      // Verify OTP using email (registration uses email-based OTP)
      const trimmedEmail = registrationEmail.trim().toLowerCase();
      console.log('🔐 [AUTH] Verifying OTP for email:', trimmedEmail);
      const otpVerification = await OTP.verifyOTP(trimmedEmail, otp, 'registration', 'email');
      if (!otpVerification.isValid) {
        console.log('❌ [AUTH] OTP verification failed:', otpVerification.message);
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }
      console.log('✅ [AUTH] OTP verified successfully');

      // Role-based validation
      let apartment = null;
      
      // Admin doesn't need apartment code - they create it after login
      if (role === 'admin') {
        console.log('👔 [AUTH] Admin registration - apartment code not required');
        // Remove apartment code and flat-related fields for admin
        delete userData.apartmentCode;
        delete userData.wing;
        delete userData.flatNumber;
        delete userData.floorNumber;
        delete userData.flatType;
      } else {
        // For resident and staff, apartment code is required
        if (!userData.apartmentCode) {
          console.log('❌ [AUTH] Apartment code missing for non-admin user');
          return res.status(400).json({
            success: false,
            message: 'Apartment code is required',
            field: 'apartmentCode'
          });
        }

        console.log(`🏢 [AUTH] Looking up apartment with code: ${userData.apartmentCode}`);
        console.log(`🏢 [AUTH] Apartment code type: ${typeof userData.apartmentCode}`);
        console.log(`🏢 [AUTH] Apartment code value: "${userData.apartmentCode}"`);

        // Verify apartment exists
        try {
          apartment = await Apartment.findByCode(userData.apartmentCode);
        } catch (findError) {
          console.error('❌ [AUTH] Error finding apartment:', findError);
          console.error('❌ [AUTH] Error stack:', findError.stack);
          return res.status(400).json({
            success: false,
            message: 'Error validating apartment code',
            error: process.env.NODE_ENV === 'development' ? findError.message : undefined
          });
        }
        
        if (!apartment) {
          console.log(`❌ [AUTH] Apartment not found with code: ${userData.apartmentCode}`);
          return res.status(400).json({
            success: false,
            message: `Invalid apartment code: ${userData.apartmentCode}. Please check and try again.`,
            field: 'apartmentCode'
          });
        }
        
        console.log(`✅ [AUTH] Apartment found: ${apartment.name} (${apartment.code})`);
      }

      // Role-based validation
      if (role === 'resident') {
        console.log('🏠 [AUTH] Validating resident flat details...');
        console.log('🏠 [AUTH] Flat details received:', {
          wing: userData.wing,
          flatNumber: userData.flatNumber,
          floorNumber: userData.floorNumber,
          floorNumberType: typeof userData.floorNumber,
          flatType: userData.flatType
        });
        
        // Residents must have flat details
        const missingFields = [];
        if (!userData.wing) missingFields.push('wing');
        if (!userData.flatNumber) missingFields.push('flatNumber');
        if (userData.floorNumber === undefined || userData.floorNumber === null) missingFields.push('floorNumber');
        if (!userData.flatType) missingFields.push('flatType');
        
        if (missingFields.length > 0) {
          console.log('❌ [AUTH] Missing flat details:', missingFields);
          return res.status(400).json({
            success: false,
            message: `Missing required fields for residents: ${missingFields.join(', ')}`,
            missingFields: missingFields
          });
        }

        // Validate floorNumber is a number
        const floorNum = typeof userData.floorNumber === 'string' 
          ? parseInt(userData.floorNumber) 
          : userData.floorNumber;
        
        if (isNaN(floorNum) || floorNum < 0) {
          console.log('❌ [AUTH] Invalid floor number:', userData.floorNumber);
          return res.status(400).json({
            success: false,
            message: 'Floor number must be a valid positive number',
            field: 'floorNumber'
          });
        }

        console.log(`🔍 [AUTH] Checking if flat exists: Wing=${userData.wing}, Flat=${userData.flatNumber}`);
        // Verify flat exists in apartment configuration
        if (!apartment.flatExists(userData.wing, userData.flatNumber)) {
          console.log('❌ [AUTH] Flat not found in apartment configuration');
          return res.status(400).json({
            success: false,
            message: `Flat ${userData.flatNumber} not found in wing ${userData.wing}. Please verify the flat details.`,
            field: 'flatNumber'
          });
        }
        console.log('✅ [AUTH] Flat exists in apartment configuration');

        // Check if flat is already occupied by active resident
        console.log('🔍 [AUTH] Checking for existing resident in flat...');
        const existingResident = await User.findOne({
          apartmentCode: userData.apartmentCode,
          wing: userData.wing,
          flatNumber: userData.flatNumber,
          role: 'resident',
          status: 'active'
        });

        if (existingResident) {
          console.log('❌ [AUTH] Flat already occupied by active resident');
          return res.status(409).json({
            success: false,
            message: 'This flat already has an active resident',
            existingResident: {
              fullName: existingResident.fullName,
              phoneNumber: existingResident.phoneNumber,
              wing: existingResident.wing,
              flatNumber: existingResident.flatNumber,
              floorNumber: existingResident.floorNumber,
              flatType: existingResident.flatType
            }
          });
        }
        console.log('✅ [AUTH] Flat is available');

        // Check if apartment has an active admin (for alert purposes)
        console.log('🔍 [AUTH] Checking for existing admin in apartment...');
        const existingAdmin = await User.findOne({
          apartmentCode: userData.apartmentCode,
          role: 'admin',
          status: 'active'
        });

        let adminInfo = null;
        if (existingAdmin) {
          console.log('⚠️ [AUTH] Apartment already has an active admin - will include in response');
          adminInfo = {
            name: existingAdmin.fullName,
            phoneNumber: existingAdmin.phoneNumber
          };
        } else {
          console.log('✅ [AUTH] No existing admin found');
        }
      } else if (role === 'staff') {
        // Staff needs apartment code validation but no flat details
        console.log('👔 [AUTH] Staff registration - validating apartment code only');
      } else if (role === 'staff') {
        console.log(`👔 [AUTH] Staff registration - no flat details required`);
        // Staff don't need flat details, but need apartment code
        // Remove flat-related fields if provided
        delete userData.wing;
        delete userData.flatNumber;
        delete userData.floorNumber;
        delete userData.flatType;
      }

      // Prepare user data for creation
      console.log('📋 [AUTH] Preparing user data for creation...');
      
      // Ensure password is a string (don't validate length - removed validation)
      const password = userData.password ? String(userData.password) : '';
      console.log('🔐 [AUTH] Password before creation:', {
        exists: !!password,
        type: typeof password,
        length: password.length,
        firstChars: password.substring(0, Math.min(5, password.length))
      });
      
      // For registration: email is required, phoneNumber from userData (optional but recommended)
      const userPhoneNumber = userData.phoneNumber || phoneNumber || '';
      
      if (!userPhoneNumber || userPhoneNumber.trim() === '') {
        console.log('❌ [AUTH] Phone number is required for user account');
        return res.status(400).json({
          success: false,
          message: 'Phone number is required for user account'
        });
      }

      const userToCreate = {
        fullName: userData.fullName.trim(),
        phoneNumber: userPhoneNumber.trim(),
        email: trimmedEmail, // Email is required for registration (used for OTP)
        role,
        password: password, // Use password as-is (no validation, no trimming)
        status: role === 'admin' ? 'active' : 'pending', // Admin is auto-active, others need approval
        isVerified: true
      };
      
      console.log('📋 [AUTH] User to create (password hidden):', {
        ...userToCreate,
        password: '***HIDDEN***'
      });

      // Add apartment code only if not admin
      if (role !== 'admin' && userData.apartmentCode) {
        userToCreate.apartmentCode = userData.apartmentCode.toUpperCase();
      } else if (role === 'admin') {
        // Explicitly set apartmentCode to undefined for admin to avoid validation issues
        userToCreate.apartmentCode = undefined;
      }

      // Add flat details only for residents
      if (role === 'resident') {
        userToCreate.wing = userData.wing.toUpperCase();
        userToCreate.flatNumber = userData.flatNumber.toUpperCase();
        // Handle floorNumber - could be string or number
        const floorNum = typeof userData.floorNumber === 'string' 
          ? parseInt(userData.floorNumber) 
          : (typeof userData.floorNumber === 'number' ? userData.floorNumber : parseInt(userData.floorNumber));
        
        if (isNaN(floorNum)) {
          console.log('❌ Invalid floor number during user creation:', userData.floorNumber);
          return res.status(400).json({
            success: false,
            message: 'Invalid floor number format',
            field: 'floorNumber'
          });
        }
        
        userToCreate.floorNumber = floorNum;
        userToCreate.flatType = userData.flatType;
        console.log('🏠 Added flat details for resident:', {
          wing: userToCreate.wing,
          flatNumber: userToCreate.flatNumber,
          floorNumber: userToCreate.floorNumber,
          flatType: userToCreate.flatType
        });
      }

      console.log('👤 [AUTH] Creating user...');
      console.log('👤 [AUTH] User data (without password):', JSON.stringify({ ...userToCreate, password: '***' }, null, 2));
      
      // Create user
      let user;
      try {
        user = await User.create(userToCreate);
        console.log(`✅ [AUTH] User created successfully: ${user._id}`);
      } catch (createError) {
        console.error('❌ [AUTH] Error creating user:', createError);
        console.error('❌ [AUTH] Error name:', createError.name);
        console.error('❌ [AUTH] Error message:', createError.message);
        console.error('❌ [AUTH] Error stack:', createError.stack);
        
        // Re-throw to be caught by outer catch block
        throw createError;
      }

      // Notify admins about new registration (via socket) - only for non-admin users
      if (role !== 'admin' && user.apartmentCode) {
        const admins = await User.find({ 
          role: 'admin', 
          apartmentCode: user.apartmentCode,
          status: 'active' 
        });
        
        admins.forEach(admin => {
          emitToUser(admin._id.toString(), 'new_registration', {
            message: 'New user registration pending approval',
            user: {
              id: user._id,
              fullName: user.fullName,
              phoneNumber: user.phoneNumber,
              role: user.role,
              apartmentCode: user.apartmentCode,
              wing: user.wing,
              flatNumber: user.flatNumber
            }
          });
        });
      }

      // Send welcome email if email is available
      if (user.email) {
        console.log('📧 [AUTH] Sending welcome email...');
        try {
          const emailResult = await sendWelcomeEmail(user);
          if (emailResult.success) {
            console.log('✅ [AUTH] Welcome email sent successfully');
          } else {
            console.warn('⚠️ [AUTH] Welcome email sending failed (non-fatal):', emailResult.message);
          }
        } catch (emailError) {
          console.warn('⚠️ [AUTH] Welcome email sending error (non-fatal):', emailError.message);
          // Don't fail the request if email fails
        }
      }

      // Prepare response data
      let message = 'Registration successful.';
      if (role === 'admin') {
        message = 'Registration successful. You can now create your apartment.';
      } else if (user.status === 'pending') {
        message = 'Registration successful. Waiting for admin approval.';
      }

      const responseData = {
        success: true,
        message: message,
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            role: user.role,
            status: user.status,
            apartmentCode: user.apartmentCode || null
          }
        }
      };

      // If resident and admin exists, include flat details and admin info
      if (role === 'resident' && adminInfo && apartment) {
        responseData.hasAdmin = true;
        responseData.flatDetails = {
          wing: user.wing,
          flatNumber: user.flatNumber,
          floorNumber: user.floorNumber,
          flatType: user.flatType,
          apartmentCode: user.apartmentCode,
          apartmentName: apartment.name
        };
        responseData.adminInfo = adminInfo;
        console.log('📋 [AUTH] Including flat details and admin info in response');
      }

      res.status(201).json(responseData);

    } catch (error) {
      console.error('❌ [AUTH] Registration error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      console.error('❌ [AUTH] Error name:', error.name);
      console.error('❌ [AUTH] Error code:', error.code);
      console.error('❌ [AUTH] Error message:', error.message);
      
      if (error.code === 11000) {
        console.log('❌ [AUTH] Duplicate key error - user already exists');
        return res.status(409).json({
          success: false,
          message: 'User already exists with this phone number'
        });
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message).join(', ');
        const errorDetails = {};
        Object.keys(error.errors).forEach(key => {
          errorDetails[key] = {
            message: error.errors[key].message,
            kind: error.errors[key].kind,
            path: error.errors[key].path,
            value: key === 'password' ? '***HIDDEN***' : error.errors[key].value
          };
        });
        
        console.log('❌ [AUTH] Validation error:', messages);
        console.log('❌ [AUTH] Validation error details:', JSON.stringify(errorDetails, null, 2));
        
        // Get the first error field
        const firstErrorKey = Object.keys(error.errors)[0];
        const firstError = error.errors[firstErrorKey];
        
        return res.status(400).json({
          success: false,
          message: messages || firstError.message,
          field: firstErrorKey,
          errors: errorDetails
        });
      }

      console.error('❌ [AUTH] Unexpected error during registration');
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };

  // @desc    Verify OTP and login
  // @route   POST /api/auth/verify-otp-login
  // @access  Public
  const verifyOTPAndLogin = async (req, res) => {
    try {
      console.log('🔑 [AUTH] OTP Login request received');
      console.log('🔑 [AUTH] Request body:', JSON.stringify({ ...req.body, otp: '***' }, null, 2));
      
      const { email, otp } = req.body;

      if (!email || !otp) {
        console.log('❌ [AUTH] Missing email or OTP');
        return res.status(400).json({
          success: false,
          message: 'Email and OTP are required'
        });
      }

      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail)) {
        console.log('❌ [AUTH] Invalid email format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // Verify OTP
      console.log('🔐 [AUTH] Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(trimmedEmail, otp, 'login', 'email');
      if (!otpVerification.isValid) {
        console.log('❌ [AUTH] OTP verification failed:', otpVerification.message);
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }
      console.log('✅ [AUTH] OTP verified successfully');

      // Get user
      console.log('🔍 [AUTH] Finding user...');
      const user = await User.findOne({ email: trimmedEmail, status: 'active' });
      if (!user) {
        console.log('❌ [AUTH] User not found or account not active');
        return res.status(404).json({
          success: false,
          message: 'User not found or account not active'
        });
      }
      console.log(`✅ [AUTH] User found: ${user._id} (${user.role})`);

      // Check if account is locked
      if (user.isLocked()) {
        console.log('🔒 [AUTH] Account is locked');
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked. Try again later.'
        });
      }

      // Reset login attempts on successful login
      console.log('🔄 [AUTH] Resetting login attempts...');
      await User.findByIdAndUpdate(user._id, {
        loginAttempts: 0,
        lockUntil: undefined,
        lastLogin: new Date()
      });

      // Generate token
      console.log('🎫 [AUTH] Generating token...');
      const token = generateToken(user._id);
      console.log('✅ [AUTH] Token generated');

      // Emit login event via socket
      console.log('📡 [AUTH] Emitting login event via socket...');
      emitToUser(user._id.toString(), 'user_logged_in', {
        message: 'Login successful',
        timestamp: new Date()
      });

      console.log('✅ [AUTH] OTP Login successful');
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
            apartmentCode: user.apartmentCode,
            wing: user.wing,
            flatNumber: user.flatNumber,
            floorNumber: user.floorNumber,
            flatType: user.flatType,
            profilePicture: user.profilePicture,
            status: user.status
          },
          token
        }
      });

    } catch (error) {
      console.error('❌ [AUTH] OTP Login error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Password login (supports email or phone)
  // @route   POST /api/auth/password-login
  // @access  Public
  const passwordLogin = async (req, res) => {
    try {
      console.log('🔑 [AUTH] Password Login request received');
      console.log('🔑 [AUTH] Request body:', JSON.stringify({ ...req.body, password: '***' }, null, 2));
      
      const { identifier, password } = req.body; // identifier can be email or phone

      // Validate input
      if (!identifier || !password) {
        console.log('❌ [AUTH] Missing identifier or password');
        return res.status(400).json({
          success: false,
          message: 'Please provide email/phone number and password'
        });
      }

      // Determine if identifier is email or phone
      const isEmail = identifier.includes('@');
      const trimmedIdentifier = isEmail ? identifier.trim().toLowerCase() : identifier.trim();
      
      // First check if user exists (any status)
      console.log('🔍 [AUTH] Checking if user exists...');
      const baseQuery = isEmail 
        ? { email: trimmedIdentifier }
        : { phoneNumber: trimmedIdentifier };
      
      const anyUser = await User.findOne(baseQuery);
      
      if (!anyUser) {
        console.log('❌ [AUTH] No account found with this identifier');
        return res.status(404).json({
          success: false,
          message: 'Account not found. Please register first.'
        });
      }

      // Check if account is active
      if (anyUser.status !== 'active') {
        console.log('❌ [AUTH] Account is not active');
        return res.status(403).json({
          success: false,
          message: 'Account is not active. Please contact support or wait for admin approval.'
        });
      }

      // Get user with password for verification
      console.log('🔍 [AUTH] Finding user with password...');
      const activeQuery = isEmail 
        ? { email: trimmedIdentifier, status: 'active' }
        : { phoneNumber: trimmedIdentifier, status: 'active' };
      
      const user = await User.findOne(activeQuery)
        .select('+password +loginAttempts +lockUntil');

      if (!user) {
        console.log('❌ [AUTH] User not found (should not happen)');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      console.log(`✅ [AUTH] User found: ${user._id} (${user.role})`);

      // Check if account is locked
      if (user.isLocked()) {
        console.log('🔒 [AUTH] Account is locked');
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked due to too many failed attempts. Please try again later.'
        });
      }

      // Check password
      console.log('🔐 [AUTH] Verifying password...');
      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        console.log('❌ [AUTH] Password mismatch - incrementing login attempts');
        // Increment login attempts
        await user.incrementLoginAttempts();
        
        return res.status(401).json({
          success: false,
          message: 'Incorrect password. Please try again.'
        });
      }
      console.log('✅ [AUTH] Password verified');

      // Reset login attempts on successful login
      console.log('🔄 [AUTH] Resetting login attempts...');
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      console.log('🎫 [AUTH] Generating token...');
      const token = generateToken(user._id);
      console.log('✅ [AUTH] Token generated');

      // Remove password from response
      user.password = undefined;

      // Emit login event via socket
      console.log('📡 [AUTH] Emitting login event via socket...');
      emitToUser(user._id.toString(), 'user_logged_in', {
        message: 'Login successful',
        timestamp: new Date()
      });

      console.log('✅ [AUTH] Password Login successful');
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
            apartmentCode: user.apartmentCode,
            wing: user.wing,
            flatNumber: user.flatNumber,
            floorNumber: user.floorNumber,
            flatType: user.flatType,
            profilePicture: user.profilePicture,
            status: user.status
          },
          token
        }
      });

    } catch (error) {
      console.error('❌ [AUTH] Password Login error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Get current user
  // @route   GET /api/auth/me
  // @access  Private
  const getMe = async (req, res) => {
    try {
      console.log('👤 [AUTH] Get Me request received');
      console.log('👤 [AUTH] User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        console.log('❌ [AUTH] User not found');
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log(`✅ [AUTH] User found: ${user.fullName} (${user.role})`);
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      console.error('❌ [AUTH] Get Me error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error fetching user data'
      });
    }
  };

  // @desc    Admin login
  // @route   POST /api/auth/admin/login
  // @access  Public
  const adminLogin = async (req, res) => {
    try {
      console.log('👔 [AUTH] Admin Login request received');
      console.log('👔 [AUTH] Request body:', JSON.stringify({ ...req.body, password: '***' }, null, 2));
      
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        console.log('❌ [AUTH] Missing email or password');
        return res.status(400).json({
          success: false,
          message: 'Please provide email and password'
        });
      }

      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail)) {
        console.log('❌ [AUTH] Invalid email format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // First check if user exists with this email (any role/status)
      console.log('🔍 [AUTH] Checking if user exists with this email...');
      const anyUser = await User.findOne({ email: trimmedEmail });
      
      if (!anyUser) {
        console.log('❌ [AUTH] No account found with this email');
        return res.status(404).json({
          success: false,
          message: 'Account not found. Please register first.'
        });
      }

      // Check if user is admin
      if (anyUser.role !== 'admin') {
        console.log('❌ [AUTH] User exists but is not an admin');
        return res.status(403).json({
          success: false,
          message: 'This email is not registered as an admin. Please use the correct login page.'
        });
      }

      // Check if admin account is active
      if (anyUser.status !== 'active') {
        console.log('❌ [AUTH] Admin account is not active');
        return res.status(403).json({
          success: false,
          message: 'Account is not active. Please contact support.'
        });
      }

      // Get admin user with password for verification
      console.log('🔍 [AUTH] Finding admin user with password...');
      const user = await User.findOne({ 
        email: trimmedEmail, 
        role: 'admin',
        status: 'active' 
      }).select('+password +loginAttempts +lockUntil');

      if (!user) {
        console.log('❌ [AUTH] Admin not found (should not happen)');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      console.log(`✅ [AUTH] Admin found: ${user._id}`);

      // Check if account is locked
      if (user.isLocked()) {
        console.log('🔒 [AUTH] Account is locked');
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked due to too many failed attempts. Please try again later.'
        });
      }

      // Check password
      console.log('🔐 [AUTH] Verifying password...');
      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        console.log('❌ [AUTH] Password mismatch - incrementing login attempts');
        await user.incrementLoginAttempts();
        
        return res.status(401).json({
          success: false,
          message: 'Incorrect password. Please try again.'
        });
      }
      console.log('✅ [AUTH] Password verified');

      // Reset login attempts on successful login
      console.log('🔄 [AUTH] Resetting login attempts...');
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      console.log('🎫 [AUTH] Generating token...');
      const token = generateToken(user._id);
      console.log('✅ [AUTH] Token generated');

      // Remove password from response
      user.password = undefined;

      // Emit login event via socket
      console.log('📡 [AUTH] Emitting login event via socket...');
      emitToUser(user._id.toString(), 'admin_logged_in', {
        message: 'Admin login successful',
        timestamp: new Date()
      });

      console.log('✅ [AUTH] Admin Login successful');
      res.status(200).json({
        success: true,
        message: 'Admin login successful',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
            apartmentCode: user.apartmentCode,
            status: user.status,
            profilePicture: user.profilePicture
          },
          token
        }
      });

    } catch (error) {
      console.error('❌ [AUTH] Admin Login error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Admin login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Verify OTP and register admin
  // @route   POST /api/auth/admin/verify-otp-register
  // @access  Public
  const verifyOTPAndAdminRegister = async (req, res) => {
    try {
      console.log('👔 [AUTH] Admin Register with OTP request received');
      console.log('👔 [AUTH] Request body:', JSON.stringify({ ...req.body, password: '***', otp: '***' }, null, 2));
      
      const { email, password, fullName, phoneNumber, otp } = req.body;

      // Validate required fields
      if (!email || !password || !fullName || !otp) {
        console.log('❌ [AUTH] Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Email, password, full name, and OTP are required'
        });
      }

      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail)) {
        console.log('❌ [AUTH] Invalid email format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // Validate phone number format if provided
      if (phoneNumber) {
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(phoneNumber)) {
          console.log('❌ [AUTH] Invalid phone number format');
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid Indian phone number'
          });
        }
      }

      // Verify OTP
      console.log('🔐 [AUTH] Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(trimmedEmail, otp, 'admin_registration', 'email');
      
      if (!otpVerification.isValid) {
        console.log('❌ [AUTH] OTP verification failed:', otpVerification.message);
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }
      console.log('✅ [AUTH] OTP verified successfully');

      // Check if admin already exists
      console.log('🔍 [AUTH] Checking for existing admin...');
      const existingAdmin = await User.findOne({ 
        email: trimmedEmail, 
        role: 'admin' 
      });
      
      if (existingAdmin) {
        console.log('❌ [AUTH] Admin already exists');
        return res.status(409).json({
          success: false,
          message: 'Admin already exists with this email address'
        });
      }
      console.log('✅ [AUTH] Admin does not exist - can register');

      // Create admin user
      console.log('👤 [AUTH] Creating admin user...');
      const userData = {
        fullName: fullName.trim(),
        email: trimmedEmail,
        password: String(password),
        role: 'admin',
        status: 'active', // Admin is auto-active
        isVerified: true
      };
      
      // Add phone number if provided
      if (phoneNumber) {
        userData.phoneNumber = phoneNumber.trim();
      }
      
      const user = await User.create(userData);

      console.log(`✅ [AUTH] Admin created successfully: ${user._id}`);

      // Send welcome email if email is available
      if (user.email) {
        console.log('📧 [AUTH] Sending admin welcome email...');
        try {
          const emailResult = await sendAdminWelcomeEmail(user);
          if (emailResult.success) {
            console.log('✅ [AUTH] Admin welcome email sent successfully');
          } else {
            console.warn('⚠️ [AUTH] Admin welcome email sending failed (non-fatal):', emailResult.message);
          }
        } catch (emailError) {
          console.warn('⚠️ [AUTH] Admin welcome email sending error (non-fatal):', emailError.message);
          // Don't fail the request if email fails
        }
      }

      // Generate token
      console.log('🎫 [AUTH] Generating token...');
      const token = generateToken(user._id);
      console.log('✅ [AUTH] Token generated');

      // Emit registration event via socket
      console.log('📡 [AUTH] Emitting registration event via socket...');
      emitToUser(user._id.toString(), 'admin_registered', {
        message: 'Admin registration successful',
        timestamp: new Date()
      });

      console.log('✅ [AUTH] Admin Register successful');
      res.status(201).json({
        success: true,
        message: 'Admin registration successful. You can now create your apartment.',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
            status: user.status
          },
          token
        }
      });

    } catch (error) {
      console.error('❌ [AUTH] Admin Register error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      
      if (error.code === 11000) {
        console.log('❌ [AUTH] Duplicate key error - admin already exists');
        return res.status(409).json({
          success: false,
          message: 'Admin already exists with this email address'
        });
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message).join(', ');
        return res.status(400).json({
          success: false,
          message: messages
        });
      }

      res.status(500).json({
        success: false,
        message: 'Admin registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Admin register (deprecated - use verifyOTPAndAdminRegister)
  // @route   POST /api/auth/admin/register
  // @access  Public
  const adminRegister = async (req, res) => {
    // Redirect to OTP-based registration
    return res.status(400).json({
      success: false,
      message: 'Please use OTP verification for admin registration. Send OTP first, then verify and register.'
    });
  };

  // @desc    Verify OTP and reset password
  // @route   POST /api/auth/verify-otp-reset-password
  // @access  Public
  const verifyOTPAndResetPassword = async (req, res) => {
    try {
      console.log('🔐 [AUTH] Reset Password request received');
      console.log('🔐 [AUTH] Request body:', JSON.stringify({ ...req.body, otp: '***', newPassword: '***' }, null, 2));
      
      const { email, otp, newPassword } = req.body;

      // Validate required fields
      if (!email || !otp || !newPassword) {
        console.log('❌ [AUTH] Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Email, OTP, and new password are required'
        });
      }

      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail)) {
        console.log('❌ [AUTH] Invalid email format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // Validate password
      if (typeof newPassword !== 'string' || newPassword.trim() === '') {
        console.log('❌ [AUTH] Password is required');
        return res.status(400).json({
          success: false,
          message: 'Password is required'
        });
      }

      // Find user by email
      console.log('🔍 [AUTH] Finding user by email...');
      const user = await User.findOne({ email: trimmedEmail, status: 'active' });
      if (!user) {
        console.log('❌ [AUTH] User not found');
        // Don't reveal if user exists for security
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }
      console.log(`✅ [AUTH] User found: ${user._id}`);

      // Verify OTP
      console.log('🔐 [AUTH] Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(trimmedEmail, otp, 'forgot-password', 'email');
      if (!otpVerification.isValid) {
        console.log('❌ [AUTH] OTP verification failed:', otpVerification.message);
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }
      console.log('✅ [AUTH] OTP verified successfully');

      // Update password
      console.log('🔐 [AUTH] Updating password...');
      user.password = String(newPassword);
      await user.save();
      console.log('✅ [AUTH] Password updated successfully');

      console.log('✅ [AUTH] Password reset successful');
      res.status(200).json({
        success: true,
        message: 'Password reset successfully. You can now login with your new password.'
      });

    } catch (error) {
      console.error('❌ [AUTH] Reset Password error:', error);
      console.error('❌ [AUTH] Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Password reset failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  module.exports = {
    sendOTP,
    verifyOTPAndRegister,
    verifyOTPAndLogin,
    passwordLogin,
    getMe,
    adminLogin,
    adminRegister,
    verifyOTPAndAdminRegister,
    verifyOTPAndResetPassword
  };