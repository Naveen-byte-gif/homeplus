  const User = require('../models/User');
  const OTP = require('../models/OTP');
  const Apartment = require('../models/Apartment');
  const { generateToken } = require('../middleware/auth');
  // const { sendOTP } = require('../services/smsService');
  const { emitToUser } = require('../services/socketService');

  // @desc    Send OTP for registration/login
  // @route   POST /api/auth/send-otp
  // @access  Public
  const sendOTP = async (req, res) => {
    try {
      const { phoneNumber, purpose } = req.body;

      // Validate phone number format
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Indian phone number'
        });
      }

      // Check if user already exists for registration
      if (purpose === 'registration') {
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: 'User already exists with this phone number'
          });
        }
      }

      // Check if user exists for login
      if (purpose === 'login') {
        const user = await User.findOne({ phoneNumber, status: 'active' });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'No account found with this phone number'
          });
        }
      }

      // Generate and save OTP
      const otpRecord = await OTP.generateOTP(phoneNumber, purpose);

      // Send OTP via SMS (in production)
      if (process.env.NODE_ENV === 'production') {
        await sendOTP(phoneNumber, otpRecord.otp);
      } else {
        console.log(`OTP for ${phoneNumber}: ${otpRecord.otp}`); // For development
      }

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
      console.error('Send OTP error:', error);
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
      const { phoneNumber, otp, userData } = req.body;

      // Verify OTP
      const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'registration');
      if (!otpVerification.isValid) {
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }

      // Verify apartment exists
      const apartment = await Apartment.findByCode(userData.apartmentCode);
      if (!apartment) {
        return res.status(400).json({
          success: false,
          message: 'Invalid apartment code'
        });
      }

      // Verify flat exists in apartment configuration
      if (!apartment.flatExists(userData.wing, userData.flatNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Flat not found in the specified wing'
        });
      }

      // Check if flat is already occupied by active user
      const existingResident = await User.findOne({
        apartmentCode: userData.apartmentCode,
        wing: userData.wing,
        flatNumber: userData.flatNumber,
        status: 'active'
      });

      if (existingResident) {
        return res.status(409).json({
          success: false,
          message: 'This flat already has an active resident'
        });
      }

      // Create user
      const user = await User.create({
        ...userData,
        phoneNumber,
        status: 'pending', // Requires admin approval
        isVerified: true
      });

      // Notify admins about new registration (via socket)
      const admins = await User.find({ role: 'admin', status: 'active' });
      admins.forEach(admin => {
        emitToUser(admin._id.toString(), 'new_registration', {
          message: 'New user registration pending approval',
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            apartmentCode: user.apartmentCode,
            wing: user.wing,
            flatNumber: user.flatNumber
          }
        });
      });

      res.status(201).json({
        success: true,
        message: 'Registration successful. Waiting for admin approval.',
        data: {
          user: {
            id: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            status: user.status
          }
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'User already exists with this phone number or flat'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Verify OTP and login
  // @route   POST /api/auth/verify-otp-login
  // @access  Public
  const verifyOTPAndLogin = async (req, res) => {
    try {
      const { phoneNumber, otp } = req.body;

      // Verify OTP
      const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'login');
      if (!otpVerification.isValid) {
        return res.status(400).json({
          success: false,
          message: otpVerification.message
        });
      }

      // Get user
      const user = await User.findOne({ phoneNumber, status: 'active' });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found or account not active'
        });
      }

      // Check if account is locked
      if (user.isLocked()) {
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked. Try again later.'
        });
      }

      // Reset login attempts on successful login
      await User.findByIdAndUpdate(user._id, {
        loginAttempts: 0,
        lockUntil: undefined,
        lastLogin: new Date()
      });

      // Generate token
      const token = generateToken(user._id);

      // Emit login event via socket
      emitToUser(user._id.toString(), 'user_logged_in', {
        message: 'Login successful',
        timestamp: new Date()
      });

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
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  // @desc    Password login
  // @route   POST /api/auth/password-login
  // @access  Public
  const passwordLogin = async (req, res) => {
    try {
      const { phoneNumber, password } = req.body;

      // Validate input
      if (!phoneNumber || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide phone number and password'
        });
      }

      // Get user with password
      const user = await User.findOne({ phoneNumber, status: 'active' })
        .select('+password +loginAttempts +lockUntil');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (user.isLocked()) {
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked due to too many failed attempts'
        });
      }

      // Check password
      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        // Increment login attempts
        await user.incrementLoginAttempts();
        
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Reset login attempts on successful login
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      // Remove password from response
      user.password = undefined;

      // Emit login event via socket
      emitToUser(user._id.toString(), 'user_logged_in', {
        message: 'Login successful',
        timestamp: new Date()
      });

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
      console.error('Password login error:', error);
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
      const user = await User.findById(req.user.id);

      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user data'
      });
    }
  };

  module.exports = {
    sendOTP,
    verifyOTPAndRegister,
    verifyOTPAndLogin,
    passwordLogin,
    getMe
  };