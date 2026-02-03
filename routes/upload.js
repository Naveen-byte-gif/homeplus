const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadConfigs } = require('../config/cloudinary');

// @desc    Upload media file (generic upload for profile pictures, etc.)
// @route   POST /api/upload/media
// @access  Private
router.post(
  '/media',
  protect,
  (req, res, next) => {
    // Set timeout for this route (60 seconds for image uploads)
    req.setTimeout(60000, () => {
      res.status(408).json({
        success: false,
        message: 'Upload request timeout. Please try again with a smaller image or check your connection.'
      });
    });
    next();
  },
  uploadConfigs.profile.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      // Check if file was uploaded successfully
      if (!req.file.path) {
        return res.status(500).json({
          success: false,
          message: 'Image upload failed. Please try again.'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          media: {
            url: req.file.path,
            publicId: req.file.filename || req.file.public_id || null,
            format: req.file.mimetype,
            size: req.file.size
          }
        }
      });
    } catch (error) {
      console.error('Upload media error:', error);
      
      // Handle timeout errors specifically
      if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        return res.status(408).json({
          success: false,
          message: 'Image upload timeout. Please try again with a smaller image or check your internet connection.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error uploading image. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;

