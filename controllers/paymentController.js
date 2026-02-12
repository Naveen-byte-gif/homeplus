const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const UpiConfig = require('../models/UpiConfig');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { sendEmail } = require('../services/emailService');
const { sendNotification } = require('../services/notificationService');
const { generateInvoicePdf, generateReceiptPdf } = require('../services/pdfService');
const { getSocketService } = require('../services/socketService');
const { isValidPaymentAmount, isValidTransactionNote } = require('../utils/validators');
const { generateInvoiceNumber } = require('../utils/generators');

// @desc    Get all invoices for a resident
// @route   GET /api/payments/invoices
// @access  Private (Resident)
exports.getMyInvoices = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, limit = 50, skip = 0 } = req.query;

    const query = { flatId: userId };
    if (status) {
      query.status = status;
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        invoices,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: error.message
    });
  }
};

// @desc    Get invoice by ID
// @route   GET /api/payments/invoices/:id
// @access  Private (Resident/Owner)
exports.getInvoiceById = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check access: Resident/Owner own only; Admin all; Staff same apartment only
    if (userRole === 'admin') {
      // Admin can see all
    } else if (userRole === 'staff') {
      const staffApartment = req.user.apartmentCode;
      if (!staffApartment || invoice.apartmentCode !== staffApartment) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    } else if (invoice.flatId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get related payments
    const payments = await Payment.find({ invoiceId: invoiceId })
      .sort({ createdAt: -1 })
      .populate('verifiedBy', 'fullName');

    res.status(200).json({
      success: true,
      data: {
        invoice,
        payments
      }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoice',
      error: error.message
    });
  }
};

// @desc    Create payment entry using phone number (NO invoice required - invoice generated after payment)
// @route   POST /api/payments/create-by-phone
// @access  Private (Resident) or Public with phone validation
exports.createPaymentByPhone = async (req, res) => {
  try {
    const { phoneNumber, amount, paymentPurpose, description, invoiceId } = req.body;
    const userId = req.user?._id;

    // Validate input
    if (!phoneNumber || !amount || !paymentPurpose) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, amount, and payment purpose are required'
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit Indian phone number'
      });
    }

    // Validate minimum payment amount (₹10)
    if (!isValidPaymentAmount(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Minimum payment amount is ₹10. Test payments of ₹1 are not allowed.'
      });
    }

    // Find user by phone number
    const user = await User.findOne({ phoneNumber: phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this phone number. Please ensure you are registered.'
      });
    }

    // Get apartment code from user or request
    const apartmentCode = user.apartmentCode || req.body.apartmentCode;
    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    // Get UPI configuration
    const upiConfig = await UpiConfig.findOne({ apartmentCode: apartmentCode.toUpperCase(), isEnabled: true });
    if (!upiConfig) {
      return res.status(400).json({
        success: false,
        message: 'UPI payments are not configured or disabled for this apartment'
      });
    }

    // Format payment note - SHORT format for UPI security (max 25-30 chars)
    // Format: "Flat 102" or "Phone: 5679" (last 4 digits)
    let paymentNote = '';
    
    if (user.flatNumber && user.flatNumber.trim()) {
      // Preferred format: "Flat 102"
      paymentNote = `Flat ${user.flatNumber}`;
      
      // If too long, shorten: "F102"
      if (paymentNote.length > 30) {
        paymentNote = `F${user.flatNumber}`;
      }
    } else {
      // Fallback: Use last 4 digits of phone
      const last4Digits = phoneNumber.substring(phoneNumber.length - 4);
      paymentNote = `Phone: ${last4Digits}`;
      
      // If too long, shorten: "Ph:5679"
      if (paymentNote.length > 30) {
        paymentNote = `Ph:${last4Digits}`;
      }
    }
    
    // Final validation - must be 30 chars or less (UPI requirement)
    if (!isValidTransactionNote(paymentNote, 30)) {
      if (user.flatNumber && user.flatNumber.trim()) {
        paymentNote = `F${user.flatNumber}`;
      } else {
        paymentNote = `P${phoneNumber.substring(phoneNumber.length - 4)}`;
      }
    }

    // Generate UPI deep link with proper parameters
    const upiDeepLink = upiConfig.generateUpiDeepLink(amount, paymentNote);
    
    // Log payment attempt for audit
    try {
      await AuditLog.create({
        action: 'PAYMENT_ATTEMPT',
        description: `Payment initiated by phone ${phoneNumber}, amount: ₹${amount}`,
        performedBy: userId || user._id,
        targetEntity: 'Payment',
        targetId: null, // Will be updated after payment creation
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          phoneNumber: phoneNumber,
          amount: amount,
          paymentPurpose: paymentPurpose
        },
        request: {
          method: req.method,
          url: req.originalUrl
        },
        success: true,
        severity: 'Medium'
      });
    } catch (auditError) {
      console.error('Error logging payment attempt:', auditError);
      // Continue even if audit logging fails
    }

    // If invoiceId provided, validate it belongs to this user (by flat)
    let existingInvoice = null;
    if (invoiceId) {
      existingInvoice = await Invoice.findById(invoiceId);
      if (existingInvoice && existingInvoice.flatId.toString() === user._id.toString()) {
        // Link payment to this invoice; no new invoice will be generated on confirm
      } else {
        existingInvoice = null;
      }
    }

    const paymentData = {
      phoneNumber: phoneNumber,
      flatId: user._id,
      apartmentCode: apartmentCode.toUpperCase(),
      amount: amount,
      paymentPurpose: paymentPurpose,
      description: description,
      transactionNote: paymentNote,
      status: 'pending_verification',
      paymentDate: new Date(),
      createdBy: userId || user._id
    };
    if (existingInvoice) {
      paymentData.invoiceId = existingInvoice._id;
      paymentData.invoiceNumber = existingInvoice.invoiceNumber;
    }
    const payment = await Payment.create(paymentData);
    
    // Update audit log with payment ID
    try {
      await AuditLog.updateOne(
        { 
          performedBy: userId || user._id, 
          action: 'PAYMENT_ATTEMPT',
          targetId: null 
        },
        { 
          $set: { targetId: payment._id } 
        },
        { sort: { createdAt: -1 }, limit: 1 }
      );
    } catch (auditError) {
      console.error('Error updating audit log with payment ID:', auditError);
    }

    res.status(201).json({
      success: true,
      data: {
        payment,
        upiDeepLink,
        paymentNote,
        message: 'Pay via UPI app. Invoice will be generated after payment confirmation.'
      }
    });
  } catch (error) {
    console.error('Error creating payment by phone:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
};

// @desc    Create payment entry (initiate UPI payment) - WITH invoice
// @route   POST /api/payments/create
// @access  Private (Resident)
exports.createPayment = async (req, res) => {
  try {
    const { invoiceId, amount, paymentPurpose, description } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!invoiceId || !amount || !paymentPurpose) {
      return res.status(400).json({
        success: false,
        message: 'Invoice ID, amount, and payment purpose are required'
      });
    }

    // Get invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if invoice belongs to user
    if (invoice.flatId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if invoice is already paid
    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is already paid'
      });
    }

    // Validate minimum payment amount (₹10)
    if (!isValidPaymentAmount(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Minimum payment amount is ₹10. Test payments of ₹1 are not allowed.'
      });
    }

    // Validate amount doesn't exceed outstanding
    if (amount > invoice.outstandingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed outstanding amount of ₹${invoice.outstandingAmount}`
      });
    }

    // Get UPI configuration
    const upiConfig = await UpiConfig.findOne({ apartmentCode: invoice.apartmentCode });
    if (!upiConfig || !upiConfig.isEnabled) {
      return res.status(400).json({
        success: false,
        message: 'UPI payments are not configured or disabled for this apartment'
      });
    }

    // Get user details for payment note
    const user = await User.findById(userId);
    
    // Format payment note - SHORT format for UPI security (max 30 chars)
    // Exact format: "INV-102 | Flat 102" (25-30 chars recommended)
    let paymentNote = upiConfig.formatPaymentNote(invoice.invoiceNumber, user.flatNumber || '');
    
    // Ensure note is exactly within 25-30 character range (UPI requirement)
    if (paymentNote.length > 30) {
      // Try shorter format: "INV-102 | F102"
      const flatNum = user.flatNumber || '';
      const shortInv = invoice.invoiceNumber.includes('-') 
        ? invoice.invoiceNumber.split('-').pop() 
        : invoice.invoiceNumber.substring(0, 10);
      
      if (flatNum) {
        paymentNote = `INV-${shortInv} | F${flatNum}`;
      } else {
        paymentNote = `INV-${shortInv}`;
      }
    }
    
    // Final validation - must be 30 chars or less
    if (paymentNote.length > 30) {
      const shortInv = invoice.invoiceNumber.includes('-') 
        ? invoice.invoiceNumber.split('-').pop() 
        : invoice.invoiceNumber.substring(0, 10);
      paymentNote = `INV-${shortInv}`;
    }
    
    // Validate transaction note length (25-30 chars recommended for UPI)
    if (!isValidTransactionNote(paymentNote, 30)) {
      const shortInv = invoice.invoiceNumber.includes('-') 
        ? invoice.invoiceNumber.split('-').pop() 
        : invoice.invoiceNumber.substring(0, 10);
      paymentNote = `INV-${shortInv}`;
    }

    // Generate UPI deep link with proper parameters
    const upiDeepLink = upiConfig.generateUpiDeepLink(amount, paymentNote);
    
    // Log payment attempt for audit
    try {
      await AuditLog.create({
        action: 'PAYMENT_ATTEMPT',
        description: `Payment initiated for invoice ${invoice.invoiceNumber}, amount: ₹${amount}`,
        performedBy: userId,
        targetEntity: 'Payment',
        targetId: null, // Will be updated after payment creation
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          amount: amount,
          paymentPurpose: paymentPurpose,
          upiId: upiConfig.activeUpiId.upiId
        },
        request: {
          method: req.method,
          url: req.originalUrl
        },
        success: true,
        severity: 'Medium'
      });
    } catch (auditError) {
      console.error('Error logging payment attempt:', auditError);
      // Continue even if audit logging fails
    }

    // Create payment record
    const payment = await Payment.create({
      invoiceId,
      flatId: userId,
      apartmentCode: invoice.apartmentCode,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      paymentPurpose,
      description,
      transactionNote: paymentNote,
      status: 'pending_verification',
      paymentDate: new Date(),
      createdBy: userId
    });
    
    // Update audit log with payment ID
    try {
      await AuditLog.updateOne(
        { 
          performedBy: userId, 
          action: 'PAYMENT_ATTEMPT',
          targetId: null 
        },
        { 
          $set: { targetId: payment._id } 
        },
        { sort: { createdAt: -1 }, limit: 1 }
      );
    } catch (auditError) {
      console.error('Error updating audit log with payment ID:', auditError);
    }

    res.status(201).json({
      success: true,
      data: {
        payment,
        upiDeepLink,
        upiId: upiConfig.activeUpiId.upiId,
        accountHolderName: upiConfig.activeUpiId.accountHolderName,
        paymentNote
      }
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
};

// @desc    Confirm payment (after UPI payment) - Generate invoice if needed
// @route   POST /api/payments/:id/confirm
// @access  Private (Resident)
exports.confirmPayment = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { upiReferenceId, paymentDate } = req.body;
    const userId = req.user._id;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if payment belongs to user (by flatId or phoneNumber)
    let user;
    if (payment.flatId) {
      if (payment.flatId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      user = await User.findById(userId);
    } else if (payment.phoneNumber) {
      user = await User.findOne({ phoneNumber: payment.phoneNumber });
      if (!user || (userId && user._id.toString() !== userId.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment record'
      });
    }

    // Update payment with reference ID
    payment.upiReferenceId = upiReferenceId || payment.upiReferenceId;
    if (paymentDate) {
      payment.paymentDate = new Date(paymentDate);
    }

    // Generate invoice if payment was made by phone (no invoice exists)
    let invoice = null;
    if (!payment.invoiceId && !payment.invoiceNumber) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      
      // Generate invoice number
      const invoiceNumber = generateInvoiceNumber(payment.apartmentCode, month, year);
      
      // Create invoice for this payment
      invoice = await Invoice.create({
        invoiceNumber: invoiceNumber,
        flatId: user._id,
        apartmentCode: payment.apartmentCode,
        building: user.wing || 'A',
        flatNumber: user.flatNumber || '',
        floor: user.floorNumber || 0,
        billingPeriod: {
          startDate: new Date(year, month - 1, 1),
          endDate: new Date(year, month, 0)
        },
        items: [{
          name: payment.paymentPurpose,
          amount: payment.amount,
          description: payment.description || ''
        }],
        totalAmount: payment.amount,
        previousDues: 0,
        lateFee: 0,
        totalPayable: payment.amount,
        dueDate: now,
        status: 'pending',
        paidAmount: 0,
        outstandingAmount: payment.amount,
        notes: `Invoice generated from phone payment: ${payment.phoneNumber || ''}`,
        createdBy: user._id
      });

      // Update payment with invoice details
      payment.invoiceId = invoice._id;
      payment.invoiceNumber = invoiceNumber;
      await payment.save();
    } else {
      // Get existing invoice
      if (payment.invoiceId) {
        invoice = await Invoice.findById(payment.invoiceId);
      }
    }
    
    await payment.save();
    
    // Log payment confirmation
    try {
      await AuditLog.create({
        action: 'PAYMENT_CONFIRMED',
        description: `Payment confirmed with UTR: ${payment.upiReferenceId || 'Not provided'}${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ''}`,
        performedBy: userId || user._id,
        targetEntity: 'Payment',
        targetId: payment._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          paymentId: payment._id.toString(),
          invoiceNumber: payment.invoiceNumber || 'Generated after payment',
          amount: payment.amount,
          upiReferenceId: payment.upiReferenceId
        },
        success: true,
        severity: 'Medium'
      });
    } catch (auditError) {
      console.error('Error logging payment confirmation:', auditError);
    }

    // Generate receipt PDF
    try {
      const receiptPdf = await generateReceiptPdf(payment, invoice, user);
      payment.receiptPdfUrl = receiptPdf.url;
      await payment.save();
    } catch (pdfError) {
      console.error('Error generating receipt PDF:', pdfError);
      // Continue even if PDF generation fails
    }

    // Send email notification to resident
    try {
      await sendEmail({
        to: user.email,
        subject: `Payment Confirmation - ${payment.receiptNumber}`,
        template: 'payment-confirmation',
        data: {
          userName: user.fullName,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          invoiceNumber: payment.invoiceNumber || 'Will be generated',
          paymentDate: payment.paymentDate.toLocaleDateString('en-IN'),
          upiReferenceId: payment.upiReferenceId || 'Not provided'
        }
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
    }

    // Send in-app notification to resident
    try {
      await sendNotification({
        userId: user._id.toString(),
        title: 'Payment Submitted',
        body: `Your payment of ₹${payment.amount}${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ''} has been submitted for verification.`,
        type: 'payment_submitted',
        data: { paymentId: payment._id.toString(), invoiceId: invoice?._id?.toString() || '' }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    // Notify admin
    try {
      const admins = await User.find({ role: 'admin', apartmentCode: payment.apartmentCode });
      for (const admin of admins) {
        await sendNotification({
          userId: admin._id.toString(),
          title: 'New Payment Pending Verification',
          body: `Payment of ₹${payment.amount}${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ' (phone: ' + (payment.phoneNumber || '') + ')'} is pending verification.`,
          type: 'payment_pending_verification',
          data: { paymentId: payment._id.toString(), invoiceId: invoice?._id?.toString() || '' }
        });
      }
    } catch (notifError) {
      console.error('Error notifying admin:', notifError);
    }

    // Emit socket event
    try {
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitToUser(user._id.toString(), 'payment_confirmed', {
          paymentId: payment._id.toString(),
          invoiceId: invoice?._id?.toString() || ''
        });
      }
    } catch (socketError) {
      console.error('Error emitting socket event:', socketError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully. Invoice has been generated.',
      data: { 
        payment,
        invoice: invoice ? {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber
        } : null
      }
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: error.message
    });
  }
};

// @desc    Get all payments (admin / staff for own apartment)
// @route   GET /api/payments
// @access  Private (Admin, Staff)
exports.getAllPayments = async (req, res) => {
  try {
    const { status, apartmentCode, limit = 50, skip = 0 } = req.query;
    const userRole = req.user.role;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (apartmentCode) {
      query.apartmentCode = apartmentCode.toUpperCase();
    }
    // Staff can only see payments for their apartment
    if (userRole === 'staff' && req.user.apartmentCode) {
      query.apartmentCode = req.user.apartmentCode.toUpperCase();
    }

    const payments = await Payment.find(query)
      .populate('invoiceId', 'invoiceNumber totalPayable status')
      .populate('flatId', 'fullName flatNumber building')
      .populate('verifiedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        payments,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
};

// @desc    Verify payment (approve/reject) - Ensure invoice exists if approved
// @route   PUT /api/payments/:id/verify
// @access  Private (Admin)
exports.verifyPayment = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { action, rejectionReason } = req.body;
    const adminId = req.user._id;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject"'
      });
    }

    if (action === 'reject' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting payment'
      });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status !== 'pending_verification') {
      return res.status(400).json({
        success: false,
        message: `Payment is already ${payment.status}`
      });
    }

    // Update payment status
    payment.status = action === 'approve' ? 'approved' : 'rejected';
    payment.verifiedBy = adminId;
    payment.verifiedAt = new Date();
    if (action === 'reject') {
      payment.rejectionReason = rejectionReason;
    }
    await payment.save();
    
    // Log payment verification
    try {
      await AuditLog.create({
        action: action === 'approve' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
        description: `Payment ${action === 'approve' ? 'approved' : 'rejected'} by admin${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ''}`,
        performedBy: adminId,
        targetEntity: 'Payment',
        targetId: payment._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          paymentId: payment._id.toString(),
          invoiceNumber: payment.invoiceNumber || 'Generated after payment',
          amount: payment.amount,
          upiReferenceId: payment.upiReferenceId,
          rejectionReason: rejectionReason || null
        },
        success: true,
        severity: action === 'approve' ? 'Medium' : 'High'
      });
    } catch (auditError) {
      console.error('Error logging payment verification:', auditError);
    }

    // If approved, update/create invoice and mark as paid
    if (action === 'approve') {
      let invoice = null;
      
      // If invoice doesn't exist, create it
      if (!payment.invoiceId) {
        const user = await User.findById(payment.flatId) || await User.findOne({ phoneNumber: payment.phoneNumber });
        if (user) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          
          // Generate invoice number if not exists
          const invoiceNumber = payment.invoiceNumber || generateInvoiceNumber(payment.apartmentCode, month, year);
          
          // Create invoice
          invoice = await Invoice.create({
            invoiceNumber: invoiceNumber,
            flatId: user._id,
            apartmentCode: payment.apartmentCode,
            building: user.wing || 'A',
            flatNumber: user.flatNumber || '',
            floor: user.floorNumber || 0,
            billingPeriod: {
              startDate: new Date(year, month - 1, 1),
              endDate: new Date(year, month, 0)
            },
            items: [{
              name: payment.paymentPurpose,
              amount: payment.amount,
              description: payment.description || ''
            }],
            totalAmount: payment.amount,
            previousDues: 0,
            lateFee: 0,
            totalPayable: payment.amount,
            dueDate: now,
            status: 'paid', // Mark as paid since payment is approved
            paidAmount: payment.amount,
            outstandingAmount: 0,
            notes: `Invoice generated from approved payment${payment.phoneNumber ? ` (phone: ${payment.phoneNumber})` : ''}`,
            createdBy: user._id
          });

          // Update payment with invoice details
          payment.invoiceId = invoice._id;
          payment.invoiceNumber = invoiceNumber;
          await payment.save();
        }
      } else {
        // Invoice exists, update it
        invoice = await Invoice.findById(payment.invoiceId);
        if (invoice) {
          invoice.paidAmount += payment.amount;
          await invoice.save();

          // Populate verifiedBy for response
          await payment.populate('verifiedBy', 'fullName');

          // Generate receipt PDF if not already generated
          if (!payment.receiptPdfUrl) {
            try {
              const user = await User.findById(payment.flatId) || await User.findOne({ phoneNumber: payment.phoneNumber });
              const receiptPdf = await generateReceiptPdf(payment, invoice, user);
              payment.receiptPdfUrl = receiptPdf.url;
              await payment.save();
            } catch (pdfError) {
              console.error('Error generating receipt PDF:', pdfError);
            }
          }
        }
      }
    }

    // Get user details
    const user = await User.findById(payment.flatId) || await User.findOne({ phoneNumber: payment.phoneNumber });
    const invoice = await Invoice.findById(payment.invoiceId);

    // Send notification to resident
    try {
      await sendNotification({
        userId: payment.flatId?.toString() || user?._id?.toString() || '',
        title: action === 'approve' ? 'Payment Approved' : 'Payment Rejected',
        body: action === 'approve'
          ? `Your payment of ₹${payment.amount}${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ''} has been approved.`
          : `Your payment of ₹${payment.amount}${payment.invoiceNumber ? ` for invoice ${payment.invoiceNumber}` : ''} has been rejected. Reason: ${rejectionReason}`,
        type: action === 'approve' ? 'payment_approved' : 'payment_rejected',
        data: { paymentId: payment._id.toString(), invoiceId: invoice?._id?.toString() || '' }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    // Send email
    try {
      if (user) {
        await sendEmail({
          to: user.email,
          subject: action === 'approve' 
            ? `Payment Approved - ${payment.receiptNumber}`
            : `Payment Rejected - ${payment.receiptNumber}`,
          template: action === 'approve' ? 'payment-approved' : 'payment-rejected',
          data: {
            userName: user.fullName,
            receiptNumber: payment.receiptNumber,
            amount: payment.amount,
            invoiceNumber: payment.invoiceNumber || invoice?.invoiceNumber || 'Generated after approval',
            action: action,
            rejectionReason: rejectionReason || null
          }
        });
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: `Payment ${action === 'approve' ? 'approved' : 'rejected'} successfully${action === 'approve' && invoice ? '. Invoice generated.' : ''}`,
      data: { payment, invoice: invoice ? { id: invoice._id, invoiceNumber: invoice.invoiceNumber } : null }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
};

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private (Admin)
exports.getPaymentStats = async (req, res) => {
  try {
    const { apartmentCode, startDate, endDate } = req.query;

    const query = {};
    if (apartmentCode) {
      query.apartmentCode = apartmentCode.toUpperCase();
    }
    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    const [
      totalPayments,
      approvedPayments,
      pendingPayments,
      rejectedPayments,
      totalAmount,
      approvedAmount
    ] = await Promise.all([
      Payment.countDocuments(query),
      Payment.countDocuments({ ...query, status: 'approved' }),
      Payment.countDocuments({ ...query, status: 'pending_verification' }),
      Payment.countDocuments({ ...query, status: 'rejected' }),
      Payment.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { ...query, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalPayments,
        approvedPayments,
        pendingPayments,
        rejectedPayments,
        totalAmount: totalAmount[0]?.total || 0,
        approvedAmount: approvedAmount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching payment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment stats',
      error: error.message
    });
  }
};
