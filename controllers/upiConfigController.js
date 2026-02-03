const UpiConfig = require('../models/UpiConfig');
const { uploadToCloudinary } = require('../config/cloudinary');
const { isValidUPIId } = require('../utils/validators');

// @desc    Get UPI configuration
// @route   GET /api/upi-config
// @access  Private (Admin)
exports.getUpiConfig = async (req, res) => {
  try {
    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    let config = await UpiConfig.findOne({ apartmentCode });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'UPI configuration not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { config }
    });
  } catch (error) {
    console.error('Error fetching UPI config:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching UPI configuration',
      error: error.message
    });
  }
};

// @desc    Create or update UPI configuration (supports multiple UPI IDs)
// @route   POST /api/upi-config
// @access  Private (Admin)
exports.createOrUpdateUpiConfig = async (req, res) => {
  try {
    const {
      upiIds, // Array of UPI IDs {upiId, accountHolderName, bankName}
      upiId, // Single UPI ID (for backward compatibility)
      accountHolderName,
      bankName,
      activeUpiIdIndex, // Index of active UPI ID in array
      defaultPaymentNoteFormat,
      isEnabled
    } = req.body;

    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    // Handle QR code image upload if provided
    let qrCodeImage = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file, 'upi-qr-codes');
        qrCodeImage = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        };
      } catch (uploadError) {
        console.error('Error uploading QR code:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Error uploading QR code image',
          error: uploadError.message
        });
      }
    }

    // Check if config exists
    let config = await UpiConfig.findOne({ apartmentCode });

    if (config) {
      // Update existing config
      
      // Handle multiple UPI IDs
      if (Array.isArray(upiIds) && upiIds.length > 0) {
        // Validate all UPI IDs
        for (const upiData of upiIds) {
          if (!upiData.upiId || !isValidUPIId(upiData.upiId)) {
            return res.status(400).json({
              success: false,
              message: `Invalid UPI ID format: ${upiData.upiId || 'empty'}. Please enter a valid UPI ID from any Indian bank.`
            });
          }
          if (!upiData.accountHolderName || !upiData.accountHolderName.trim()) {
            return res.status(400).json({
              success: false,
              message: 'Account holder name is required for all UPI IDs'
            });
          }
        }

        // Update or add UPI IDs
        config.upiIds = upiIds.map((upiData, index) => ({
          upiId: upiData.upiId.toLowerCase().trim(),
          accountHolderName: upiData.accountHolderName.trim(),
          bankName: upiData.bankName?.trim() || null,
          isActive: activeUpiIdIndex !== undefined ? index === activeUpiIdIndex : upiData.isActive || false
        }));

        // Ensure at least one is active if enabled
        if (config.isEnabled && !config.upiIds.some(id => id.isActive)) {
          config.upiIds[0].isActive = true;
        }
      } else if (upiId && accountHolderName) {
        // Backward compatibility: single UPI ID
        if (!isValidUPIId(upiId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid UPI ID format: ${upiId}. Please enter a valid UPI ID from any Indian bank.`
          });
        }

        // Migrate to new structure or update existing
        if (config.upiIds.length === 0) {
          config.upiIds.push({
            upiId: upiId.toLowerCase().trim(),
            accountHolderName: accountHolderName.trim(),
            bankName: bankName?.trim() || null,
            isActive: true
          });
        } else {
          // Update first UPI ID
          config.upiIds[0].upiId = upiId.toLowerCase().trim();
          config.upiIds[0].accountHolderName = accountHolderName.trim();
          if (bankName) config.upiIds[0].bankName = bankName.trim();
        }
      }

      if (qrCodeImage) {
        // Delete old QR code if exists
        if (config.qrCodeImage?.publicId) {
          try {
            const { deleteFromCloudinary } = require('../config/cloudinary');
            await deleteFromCloudinary(config.qrCodeImage.publicId);
          } catch (deleteError) {
            console.error('Error deleting old QR code:', deleteError);
          }
        }
        config.qrCodeImage = qrCodeImage;
      }
      if (defaultPaymentNoteFormat) {
        config.defaultPaymentNoteFormat = defaultPaymentNoteFormat;
      }
      if (isEnabled !== undefined) {
        config.isEnabled = isEnabled;
      }
      config.updatedBy = req.user._id;
      await config.save();
    } else {
      // Create new config
      const newUpiIds = [];
      
      if (Array.isArray(upiIds) && upiIds.length > 0) {
        // Validate all UPI IDs
        for (const upiData of upiIds) {
          if (!upiData.upiId || !isValidUPIId(upiData.upiId)) {
            return res.status(400).json({
              success: false,
              message: `Invalid UPI ID format: ${upiData.upiId || 'empty'}. Please enter a valid UPI ID from any Indian bank.`
            });
          }
          if (!upiData.accountHolderName || !upiData.accountHolderName.trim()) {
            return res.status(400).json({
              success: false,
              message: 'Account holder name is required for all UPI IDs'
            });
          }
          newUpiIds.push({
            upiId: upiData.upiId.toLowerCase().trim(),
            accountHolderName: upiData.accountHolderName.trim(),
            bankName: upiData.bankName?.trim() || null,
            isActive: activeUpiIdIndex !== undefined ? newUpiIds.length === activeUpiIdIndex : upiData.isActive || newUpiIds.length === 0
          });
        }
      } else if (upiId && accountHolderName) {
        // Backward compatibility: single UPI ID
        if (!isValidUPIId(upiId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid UPI ID format: ${upiId}. Please enter a valid UPI ID from any Indian bank.`
          });
        }
        newUpiIds.push({
          upiId: upiId.toLowerCase().trim(),
          accountHolderName: accountHolderName.trim(),
          bankName: bankName?.trim() || null,
          isActive: true
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'At least one UPI ID and account holder name are required'
        });
      }

      config = await UpiConfig.create({
        apartmentCode,
        upiIds: newUpiIds,
        // Legacy fields for backward compatibility
        upiId: newUpiIds[0]?.upiId,
        accountHolderName: newUpiIds[0]?.accountHolderName,
        bankName: newUpiIds[0]?.bankName,
        qrCodeImage,
        defaultPaymentNoteFormat: defaultPaymentNoteFormat || 'INV-{invoiceNumber} | Flat {flatNumber}',
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        createdBy: req.user._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'UPI configuration saved successfully',
      data: { config }
    });
  } catch (error) {
    console.error('Error saving UPI config:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving UPI configuration',
      error: error.message
    });
  }
};

// @desc    Add a new UPI ID
// @route   POST /api/upi-config/upi-id
// @access  Private (Admin)
exports.addUpiId = async (req, res) => {
  try {
    const { upiId, accountHolderName, bankName, setAsActive } = req.body;
    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    if (!upiId || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'UPI ID and account holder name are required'
      });
    }

    if (!isValidUPIId(upiId)) {
      return res.status(400).json({
        success: false,
        message: `Invalid UPI ID format: ${upiId}. Please enter a valid UPI ID from any Indian bank.`
      });
    }

    let config = await UpiConfig.findOne({ apartmentCode });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'UPI configuration not found. Please create configuration first.'
      });
    }

    // Check if UPI ID already exists
    if (config.upiIds.some(id => id.upiId.toLowerCase() === upiId.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'This UPI ID already exists'
      });
    }

    // Add new UPI ID
    if (setAsActive) {
      // Set all others as inactive
      config.upiIds.forEach(id => id.isActive = false);
    }

    config.upiIds.push({
      upiId: upiId.toLowerCase().trim(),
      accountHolderName: accountHolderName.trim(),
      bankName: bankName?.trim() || null,
      isActive: setAsActive || config.upiIds.length === 0
    });

    config.updatedBy = req.user._id;
    await config.save();

    res.status(200).json({
      success: true,
      message: 'UPI ID added successfully',
      data: { config }
    });
  } catch (error) {
    console.error('Error adding UPI ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding UPI ID',
      error: error.message
    });
  }
};

// @desc    Set active UPI ID
// @route   PUT /api/upi-config/upi-id/:id/active
// @access  Private (Admin)
exports.setActiveUpiId = async (req, res) => {
  try {
    const { id } = req.params;
    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    const config = await UpiConfig.findOne({ apartmentCode });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'UPI configuration not found'
      });
    }

    const upiIdIndex = config.upiIds.findIndex(u => u._id.toString() === id);
    if (upiIdIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'UPI ID not found'
      });
    }

    // Set all as inactive, then set selected as active
    config.upiIds.forEach((u, index) => {
      u.isActive = index === upiIdIndex;
    });

    config.updatedBy = req.user._id;
    await config.save();

    res.status(200).json({
      success: true,
      message: 'Active UPI ID updated successfully',
      data: { config }
    });
  } catch (error) {
    console.error('Error setting active UPI ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting active UPI ID',
      error: error.message
    });
  }
};

// @desc    Delete UPI ID
// @route   DELETE /api/upi-config/upi-id/:id
// @access  Private (Admin)
exports.deleteUpiId = async (req, res) => {
  try {
    const { id } = req.params;
    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    const config = await UpiConfig.findOne({ apartmentCode });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'UPI configuration not found'
      });
    }

    if (config.upiIds.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only UPI ID. Add another UPI ID first or disable the configuration.'
      });
    }

    const upiIdIndex = config.upiIds.findIndex(u => u._id.toString() === id);
    if (upiIdIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'UPI ID not found'
      });
    }

    const wasActive = config.upiIds[upiIdIndex].isActive;
    
    // Remove UPI ID
    config.upiIds.splice(upiIdIndex, 1);

    // If deleted UPI was active, set first remaining as active
    if (wasActive && config.upiIds.length > 0) {
      config.upiIds[0].isActive = true;
    }

    config.updatedBy = req.user._id;
    await config.save();

    res.status(200).json({
      success: true,
      message: 'UPI ID deleted successfully',
      data: { config }
    });
  } catch (error) {
    console.error('Error deleting UPI ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting UPI ID',
      error: error.message
    });
  }
};

// @desc    Get UPI configuration for resident (public info only)
// @route   GET /api/upi-config/public
// @access  Private (Resident)
exports.getPublicUpiConfig = async (req, res) => {
  try {
    const apartmentCode = req.user.apartmentCode?.toUpperCase();

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required'
      });
    }

    const config = await UpiConfig.findOne({ apartmentCode, isEnabled: true });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'UPI payments are not configured for this apartment'
      });
    }

    const activeUpi = config.activeUpiId;

    if (!activeUpi) {
      return res.status(404).json({
        success: false,
        message: 'No active UPI ID configured'
      });
    }

    // Return only public information (active UPI ID)
    res.status(200).json({
      success: true,
      data: {
        upiId: activeUpi.upiId,
        accountHolderName: activeUpi.accountHolderName,
        bankName: activeUpi.bankName,
        qrCodeImage: config.qrCodeImage
      }
    });
  } catch (error) {
    console.error('Error fetching public UPI config:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching UPI configuration',
      error: error.message
    });
  }
};
