const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Cloudinary storage configuration for multer
const createCloudinaryStorage = (folder, allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp']) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `apartment_sync/${folder}`,
      allowed_formats: allowedFormats,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' }
      ],
      resource_type: 'auto'
    }
  });
};

// Upload configurations for different file types
const uploadConfigs = {
  // Profile pictures
  profile: multer({
    storage: createCloudinaryStorage('profiles'),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
      }
    }
  }),

  // Complaint images
  complaintImages: multer({
    storage: createCloudinaryStorage('complaints/images'),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
      }
    }
  }),

  // Chat images
  chatImages: multer({
    storage: createCloudinaryStorage('chats/images'),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
      }
    }
  }),

  // Complaint videos
  complaintVideos: multer({
    storage: createCloudinaryStorage('complaints/videos', ['mp4', 'mov', 'avi']),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 2
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only MP4, MOV, and AVI videos are allowed'), false);
      }
    }
  }),

  // Notice attachments
  noticeAttachments: multer({
    storage: createCloudinaryStorage('notices/attachments', ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 3
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg',
        'image/png'
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF, DOC, DOCX, JPEG, and PNG files are allowed'), false);
      }
    }
  }),

  // Staff documents
  staffDocuments: multer({
    storage: createCloudinaryStorage('staff/documents', ['pdf', 'jpg', 'jpeg', 'png']),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 5
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png'
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF, JPEG, and PNG files are allowed'), false);
      }
    }
  })
};

// Cloudinary utility functions
const cloudinaryUtils = {
  // Upload file to Cloudinary
  uploadFile: async (filePath, options = {}) => {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'apartment_sync/uploads',
        ...options
      });
      return {
        success: true,
        data: {
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          size: result.bytes,
          width: result.width,
          height: result.height
        }
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return {
        success: false,
        message: 'File upload failed',
        error: error.message
      };
    }
  },

  // Upload file from buffer
  uploadFromBuffer: async (buffer, filename, options = {}) => {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'apartment_sync/uploads',
          public_id: filename.split('.')[0],
          ...options
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: true,
              data: {
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                size: result.bytes,
                width: result.width,
                height: result.height
              }
            });
          }
        }
      );

      uploadStream.end(buffer);
    });
  },

  // Delete file from Cloudinary
  deleteFile: async (publicId) => {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return {
        success: result.result === 'ok',
        data: result
      };
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return {
        success: false,
        message: 'File deletion failed',
        error: error.message
      };
    }
  },

  // Delete multiple files
  deleteFiles: async (publicIds) => {
    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Cloudinary bulk delete error:', error);
      return {
        success: false,
        message: 'Files deletion failed',
        error: error.message
      };
    }
  },

  // Generate image URL with transformations
  generateImageUrl: (publicId, transformations = []) => {
    return cloudinary.url(publicId, {
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
        ...transformations
      ]
    });
  },

  // Generate responsive image URLs
  generateResponsiveUrls: (publicId, sizes = [400, 800, 1200]) => {
    return sizes.map(size => ({
      width: size,
      url: cloudinary.url(publicId, {
        transformation: [
          { width: size, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      })
    }));
  },

  // Get file information
  getFileInfo: async (publicId) => {
    try {
      const result = await cloudinary.api.resource(publicId);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Cloudinary get file info error:', error);
      return {
        success: false,
        message: 'Failed to get file information',
        error: error.message
      };
    }
  },

  // Create zip of multiple files
  createZip: async (publicIds, zipName) => {
    try {
      const result = await cloudinary.api.create_zip({
        public_ids: publicIds,
        target_public_id: `zips/${zipName}`,
        resource_type: 'image'
      });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Cloudinary create zip error:', error);
      return {
        success: false,
        message: 'Failed to create zip file',
        error: error.message
      };
    }
  },

  // Clean up unused files
  cleanupUnusedFiles: async (olderThanDays = 30) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Get all resources
      const resources = await cloudinary.api.resources({
        type: 'upload',
        max_results: 500
      });

      const unusedResources = resources.resources.filter(resource => {
        const createdAt = new Date(resource.created_at);
        return createdAt < cutoffDate;
      });

      if (unusedResources.length === 0) {
        return {
          success: true,
          message: 'No unused files found for cleanup',
          deleted: 0
        };
      }

      const publicIds = unusedResources.map(resource => resource.public_id);
      const deleteResult = await cloudinaryUtils.deleteFiles(publicIds);

      return {
        success: deleteResult.success,
        message: `Cleaned up ${unusedResources.length} unused files`,
        deleted: unusedResources.length,
        details: deleteResult.data
      };

    } catch (error) {
      console.error('Cloudinary cleanup error:', error);
      return {
        success: false,
        message: 'Cleanup failed',
        error: error.message
      };
    }
  }
};

// Error handling for file uploads
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field'
      });
    }
  }

  if (error.message.includes('Only')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next(error);
};

module.exports = {
  cloudinary,
  uploadConfigs,
  cloudinaryUtils,
  handleUploadError
};