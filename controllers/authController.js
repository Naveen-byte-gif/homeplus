  const User = require('../models/User');
  const OTP = require('../models/OTP');
  const Apartment = require('../models/Apartment');
  const { generateToken } = require('../middleware/auth');
  const { sendOTP: sendSMSOTP } = require('../services/smsService');
  const { emitToUser } = require('../services/socketService');

  // @desc    Send OTP for registration/login
  // @route   POST /api/auth/send-otp
  // @access  Public
  const sendOTP = async (req, res) => {
    try {
      console.log('📨 [AUTH] Send OTP request received');
      console.log('📨 [AUTH] Request body:', JSON.stringify(req.body, null, 2));
      
      const { phoneNumber, purpose } = req.body;

      console.log(`📱 [AUTH] Phone: ${phoneNumber}, Purpose: ${purpose}`);
      
      // Validate phone number format
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        console.log('❌ [AUTH] Invalid phone number format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Indian phone number'
        });
      }
      console.log('✅ [AUTH] Phone number format valid');

      // Check if user already exists for registration
      if (purpose === 'registration') {
        console.log('🔍 [AUTH] Checking for existing user (registration)...');
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
          console.log('❌ [AUTH] User already exists');
          return res.status(409).json({
            success: false,
            message: 'User already exists with this phone number'
          });
        }
        console.log('✅ [AUTH] User does not exist - can register');
      }

      // Check if admin already exists for admin registration
      if (purpose === 'admin_registration') {
        console.log('🔍 [AUTH] Checking for existing admin (admin_registration)...');
        const existingAdmin = await User.findOne({ phoneNumber, role: 'admin' });
        if (existingAdmin) {
          console.log('❌ [AUTH] Admin already exists');
          return res.status(409).json({
            success: false,
            message: 'Admin already exists with this phone number'
          });
        }
        console.log('✅ [AUTH] Admin does not exist - can register');
      }

      // Check if user exists for login
      if (purpose === 'login') {
        console.log('🔍 [AUTH] Checking for existing user (login)...');
        const user = await User.findOne({ phoneNumber, status: 'active' });
        if (!user) {
          console.log('❌ [AUTH] User not found or not active');
          return res.status(404).json({
            success: false,
            message: 'No account found with this phone number'
          });
        }
        console.log(`✅ [AUTH] User found: ${user._id}`);
      }

      // Generate and save OTP
      console.log('🔐 [AUTH] Generating OTP...');
      const otpRecord = await OTP.generateOTP(phoneNumber, purpose);
      console.log(`✅ [AUTH] OTP generated: ${otpRecord.otp}`);

      // Send OTP via SMS
      console.log('📲 [AUTH] Sending OTP via SMS...');
      const smsResult = await sendSMSOTP(phoneNumber, otpRecord.otp);
      
      if (!smsResult.success) {
        console.warn('⚠️ [AUTH] SMS sending failed, but OTP is still valid:', smsResult.message);
        // Don't fail the request if SMS fails - OTP is still generated and can be verified
        // In development, we log the OTP anyway
        // If it's a trial account verification issue, include OTP in the message
        if (smsResult.error && smsResult.error.includes('unverified')) {
          console.log(`📲 [AUTH] ⚠️ Trial account: Phone number needs verification. OTP code: ${otpRecord.otp}`);
          console.log(`📲 [AUTH] Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified`);
        }
      } else {
        console.log('✅ [AUTH] SMS sent successfully:', smsResult.message);
      }
      
      // In development, always log the OTP for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📲 [AUTH] OTP for ${phoneNumber}: ${otpRecord.otp}`);
      }

      console.log('✅ [AUTH] OTP sent successfully');
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phoneNumber,
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
      
      const { phoneNumber, otp, userData } = req.body;
      
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

      // Validate required fields
      if (!phoneNumber || !otp || !userData) {
        console.log('❌ [AUTH] Missing required fields:', { 
          phoneNumber: !!phoneNumber, 
          otp: !!otp, 
          userData: !!userData 
        });
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          details: {
            phoneNumber: !!phoneNumber,
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

      // Verify OTP
      console.log('🔐 Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'registration');
      if (!otpVerification.isValid) {
        console.log('❌ OTP verification failed:', otpVerification.message);
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }
      console.log('✅ OTP verified successfully');

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
      
      const userToCreate = {
        fullName: userData.fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        role,
        password: password, // Use password as-is (no validation, no trimming)
        status: role === 'admin' ? 'active' : 'pending', // Admin is auto-active, others need approval
        isVerified: true
      };
      
      console.log('📋 [AUTH] User to create (password hidden):', {
        ...userToCreate,
        password: '***HIDDEN***'
      });

      // Add email if provided
      if (userData.email && userData.email.trim() !== '') {
        userToCreate.email = userData.email.trim().toLowerCase();
      }

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
      
      const { phoneNumber, otp } = req.body;

      if (!phoneNumber || !otp) {
        console.log('❌ [AUTH] Missing phone number or OTP');
        return res.status(400).json({
          success: false,
          message: 'Phone number and OTP are required'
        });
      }

      // Verify OTP
      console.log('🔐 [AUTH] Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'login');
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
      const user = await User.findOne({ phoneNumber, status: 'active' });
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
      const query = isEmail 
        ? { email: identifier.toLowerCase(), status: 'active' }
        : { phoneNumber: identifier, status: 'active' };

      // Get user with password
      console.log('🔍 [AUTH] Finding user...');
      const user = await User.findOne(query)
        .select('+password +loginAttempts +lockUntil');

      if (!user) {
        console.log('❌ [AUTH] User not found or account not active');
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
          message: 'Account temporarily locked due to too many failed attempts'
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
          message: 'Invalid credentials'
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
      
      const { phoneNumber, password } = req.body;

      // Validate input
      if (!phoneNumber || !password) {
        console.log('❌ [AUTH] Missing phone number or password');
        return res.status(400).json({
          success: false,
          message: 'Please provide phone number and password'
        });
      }

      // Get admin user with password
      console.log('🔍 [AUTH] Finding admin user...');
      const user = await User.findOne({ 
        phoneNumber, 
        role: 'admin',
        status: 'active' 
      }).select('+password +loginAttempts +lockUntil');

      if (!user) {
        console.log('❌ [AUTH] Admin not found or not active');
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
          message: 'Account temporarily locked due to too many failed attempts'
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
          message: 'Invalid credentials'
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
      
      const { phoneNumber, password, fullName, email, otp } = req.body;

      // Validate required fields
      if (!phoneNumber || !password || !fullName || !otp) {
        console.log('❌ [AUTH] Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Phone number, password, full name, and OTP are required'
        });
      }

      // Validate phone number format
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        console.log('❌ [AUTH] Invalid phone number format');
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Indian phone number'
        });
      }

      // Verify OTP
      console.log('🔐 [AUTH] Verifying OTP...');
      const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'admin_registration');
      
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
        phoneNumber, 
        role: 'admin' 
      });
      
      if (existingAdmin) {
        console.log('❌ [AUTH] Admin already exists');
        return res.status(409).json({
          success: false,
          message: 'Admin already exists with this phone number'
        });
      }
      console.log('✅ [AUTH] Admin does not exist - can register');

      // Create admin user
      console.log('👤 [AUTH] Creating admin user...');
      const user = await User.create({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email ? email.trim().toLowerCase() : undefined,
        password: String(password),
        role: 'admin',
        status: 'active', // Admin is auto-active
        isVerified: true
      });

      console.log(`✅ [AUTH] Admin created successfully: ${user._id}`);

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
          message: 'Admin already exists with this phone number'
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

  module.exports = {
    sendOTP,
    verifyOTPAndRegister,
    verifyOTPAndLogin,
    passwordLogin,
    getMe,
    adminLogin,
    adminRegister,
    verifyOTPAndAdminRegister
  };