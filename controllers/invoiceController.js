const Invoice = require('../models/Invoice');
const User = require('../models/User');
const { generateInvoicePdf } = require('../services/pdfService');

// @desc    Create invoice
// @route   POST /api/invoices
// @access  Private (Admin)
exports.createInvoice = async (req, res) => {
  try {
    const {
      flatId,
      billingPeriod,
      items,
      dueDate,
      notes
    } = req.body;

    // Validate input
    if (!flatId || !billingPeriod || !items || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Flat ID, billing period, items, and due date are required'
      });
    }

    // Get flat/user details
    const flat = await User.findById(flatId);
    if (!flat) {
      return res.status(404).json({
        success: false,
        message: 'Flat/User not found'
      });
    }

    // Calculate amounts
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    
    // Get previous dues from unpaid invoices
    const previousInvoices = await Invoice.find({
      flatId: flatId,
      status: { $in: ['pending', 'overdue', 'partially_paid'] }
    });
    const previousDues = previousInvoices.reduce((sum, inv) => sum + inv.outstandingAmount, 0);

    // Calculate late fee (if any previous invoices are overdue)
    let lateFee = 0;
    for (const inv of previousInvoices) {
      if (inv.status === 'overdue') {
        const daysOverdue = Math.floor((new Date() - inv.dueDate) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 0) {
          lateFee += daysOverdue * 50; // ₹50 per day
        }
      }
    }

    const totalPayable = totalAmount + previousDues + lateFee;

    // Generate invoice number
    const invoiceNumber = `INV-${flat.apartmentCode}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      flatId,
      apartmentCode: flat.apartmentCode,
      building: flat.building || flat.wing,
      flatNumber: flat.flatNumber,
      floor: flat.floorNumber || flat.floor || 0, // Use floorNumber from User model, fallback to floor, then 0
      billingPeriod: {
        startDate: new Date(billingPeriod.startDate),
        endDate: new Date(billingPeriod.endDate)
      },
      items,
      totalAmount,
      previousDues,
      lateFee,
      totalPayable,
      dueDate: new Date(dueDate),
      notes,
      createdBy: req.user._id
    });

    // Send notification to resident
    try {
      const { sendNotification } = require('../services/notificationService');
      await sendNotification({
        userId: flatId.toString(),
        title: 'New Invoice Generated',
        body: `A new invoice of ₹${totalPayable} has been generated for your flat.`,
        type: 'new_invoice',
        data: { invoiceId: invoice._id.toString() }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { invoice }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating invoice',
      error: error.message
    });
  }
};

// @desc    Get all invoices (admin)
// @route   GET /api/invoices
// @access  Private (Admin)
exports.getAllInvoices = async (req, res) => {
  try {
    const { status, apartmentCode, limit = 50, skip = 0 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (apartmentCode) {
      query.apartmentCode = apartmentCode.toUpperCase();
    }

    const invoices = await Invoice.find(query)
      .populate('flatId', 'fullName flatNumber building')
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

// @desc    Download invoice PDF
// @route   GET /api/invoices/:id/pdf
// @access  Private (Resident/Owner/Admin)
exports.downloadInvoicePdf = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    const invoice = await Invoice.findById(invoiceId)
      .populate('flatId', 'fullName flatNumber building email phoneNumber');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check access
    if (userRole !== 'admin' && invoice.flatId._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePdf(invoice, invoice.flatId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice PDF',
      error: error.message
    });
  }
};

// @desc    Get invoice statistics
// @route   GET /api/invoices/stats
// @access  Private (Admin)
exports.getInvoiceStats = async (req, res) => {
  try {
    const { apartmentCode } = req.query;

    const query = {};
    if (apartmentCode) {
      query.apartmentCode = apartmentCode.toUpperCase();
    }

    const [
      totalInvoices,
      pendingInvoices,
      paidInvoices,
      overdueInvoices,
      totalOutstanding
    ] = await Promise.all([
      Invoice.countDocuments(query),
      Invoice.countDocuments({ ...query, status: 'pending' }),
      Invoice.countDocuments({ ...query, status: 'paid' }),
      Invoice.countDocuments({ ...query, status: 'overdue' }),
      Invoice.aggregate([
        { $match: { ...query, status: { $in: ['pending', 'overdue', 'partially_paid'] } } },
        { $group: { _id: null, total: { $sum: '$outstandingAmount' } } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalInvoices,
        pendingInvoices,
        paidInvoices,
        overdueInvoices,
        totalOutstanding: totalOutstanding[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching invoice stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoice stats',
      error: error.message
    });
  }
};

