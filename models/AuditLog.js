const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Action performed
  action: {
    type: String,
    required: true,
    enum: [
      // User actions
      'USER_REGISTERED',
      'USER_APPROVED',
      'USER_REJECTED',
      'USER_SUSPENDED',
      'USER_ACTIVATED',
      'USER_PROFILE_UPDATED',
      'USER_PASSWORD_CHANGED',
      'USER_LOGGED_IN',
      'USER_LOGGED_OUT',
      'USER_CONNECTED',
      'USER_DISCONNECTED',
      
      // Complaint actions
      'COMPLAINT_CREATED',
      'COMPLAINT_UPDATED',
      'COMPLAINT_STATUS_CHANGED',
      'COMPLAINT_ASSIGNED',
      'COMPLAINT_RESOLVED',
      'COMPLAINT_CLOSED',
      'COMPLAINT_CANCELLED',
      'COMPLAINT_REOPENED',
      'COMPLAINT_RATED',
      'WORK_UPDATE_ADDED',
      
      // Notice actions
      'NOTICE_CREATED',
      'NOTICE_PUBLISHED',
      'NOTICE_UPDATED',
      'NOTICE_DELETED',
      'NOTICE_READ',
      
      // Staff actions
      'STAFF_CREATED',
      'STAFF_UPDATED',
      'STAFF_AVAILABILITY_UPDATED',
      'STAFF_SPECIALIZATION_UPDATED',
      
      // Admin actions
      'ADMIN_ACTION',
      'SETTINGS_UPDATED',
      'REPORT_GENERATED',
      
      // System actions
      'SYSTEM_BACKUP',
      'SYSTEM_MAINTENANCE',
      'DATA_EXPORT',
      'DATA_IMPORT',
      
      // Security actions
      'LOGIN_ATTEMPT',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'SECURITY_ALERT',
      'UNAUTHORIZED_ACCESS'
    ]
  },
  
  // Description of the action
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // User who performed the action
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Target entity type
  targetEntity: {
    type: String,
    enum: [
      'User',
      'Complaint',
      'Notice',
      'Staff',
      'Apartment',
      'Payment',
      'System',
      'Settings'
    ]
  },
  
  // Target entity ID
  targetId: mongoose.Schema.Types.ObjectId,
  
  // IP address of the requester
  ipAddress: String,
  
  // User agent/browser information
  userAgent: String,
  
  // Additional metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  // Request details
  request: {
    method: String,
    url: String,
    params: mongoose.Schema.Types.Mixed,
    query: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed
  },
  
  // Response details
  response: {
    statusCode: Number,
    message: String,
    error: String
  },
  
  // Timestamp of the action
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Severity level
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Low'
  },
  
  // Session ID
  sessionId: String,
  
  // Location information (if available)
  location: {
    country: String,
    city: String,
    region: String,
    timezone: String
  },
  
  // Duration of the action (in milliseconds)
  duration: Number,
  
  // Whether the action was successful
  success: {
    type: Boolean,
    default: true
  },
  
  // Error details if action failed
  error: {
    message: String,
    stack: String,
    code: String
  }
}, {
  timestamps: true,
  
  // Auto-expire logs after 2 years (730 days)
  expireAfterSeconds: 730 * 24 * 60 * 60
});

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ targetEntity: 1, targetId: 1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ success: 1, timestamp: -1 });

// Static methods for common queries
auditLogSchema.statics.findByAction = function(action, limit = 100) {
  return this.find({ action })
    .populate('performedBy', 'fullName role')
    .sort({ timestamp: -1 })
    .limit(limit);
};

auditLogSchema.statics.findByUser = function(userId, limit = 100) {
  return this.find({ performedBy: userId })
    .populate('performedBy', 'fullName role')
    .sort({ timestamp: -1 })
    .limit(limit);
};

auditLogSchema.statics.findByTarget = function(entityType, entityId, limit = 100) {
  return this.find({ 
    targetEntity: entityType, 
    targetId: entityId 
  })
  .populate('performedBy', 'fullName role')
  .sort({ timestamp: -1 })
  .limit(limit);
};

auditLogSchema.statics.findBySeverity = function(severity, limit = 100) {
  return this.find({ severity })
    .populate('performedBy', 'fullName role')
    .sort({ timestamp: -1 })
    .limit(limit);
};

auditLogSchema.statics.getStats = async function(timeRange = '7d') {
  const now = new Date();
  let startDate;
  
  switch (timeRange) {
    case '1d':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case '7d':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '30d':
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case '90d':
      startDate = new Date(now.setDate(now.getDate() - 90));
      break;
    default:
      startDate = new Date(now.setDate(now.getDate() - 7));
  }
  
  const stats = await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          success: '$success',
          severity: '$severity'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.action',
        total: { $sum: '$count' },
        success: {
          $sum: {
            $cond: [{ $eq: ['$_id.success', true] }, '$count', 0]
          }
        },
        failures: {
          $sum: {
            $cond: [{ $eq: ['$_id.success', false] }, '$count', 0]
          }
        },
        bySeverity: {
          $push: {
            severity: '$_id.severity',
            count: '$count'
          }
        }
      }
    },
    {
      $project: {
        action: '$_id',
        total: 1,
        success: 1,
        failures: 1,
        successRate: {
          $multiply: [
            { $divide: ['$success', '$total'] },
            100
          ]
        },
        bySeverity: 1
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
  
  return stats;
};

// Instance method to format log for display
auditLogSchema.methods.toDisplayFormat = function() {
  return {
    id: this._id,
    action: this.action,
    description: this.description,
    performedBy: this.performedBy,
    targetEntity: this.targetEntity,
    targetId: this.targetId,
    timestamp: this.timestamp,
    severity: this.severity,
    success: this.success,
    ipAddress: this.ipAddress,
    metadata: this.metadata ? Object.fromEntries(this.metadata) : {},
    duration: this.duration
  };
};

// Pre-save middleware to set severity based on action
auditLogSchema.pre('save', function(next) {
  // Set severity based on action type
  const criticalActions = [
    'UNAUTHORIZED_ACCESS',
    'SECURITY_ALERT',
    'USER_SUSPENDED',
    'SYSTEM_MAINTENANCE'
  ];
  
  const highSeverityActions = [
    'USER_REJECTED',
    'COMPLAINT_CANCELLED',
    'PASSWORD_RESET_COMPLETED',
    'ADMIN_ACTION'
  ];
  
  const mediumSeverityActions = [
    'USER_REGISTERED',
    'USER_APPROVED',
    'COMPLAINT_CREATED',
    'COMPLAINT_RESOLVED',
    'NOTICE_PUBLISHED'
  ];
  
  if (criticalActions.includes(this.action)) {
    this.severity = 'Critical';
  } else if (highSeverityActions.includes(this.action)) {
    this.severity = 'High';
  } else if (mediumSeverityActions.includes(this.action)) {
    this.severity = 'Medium';
  } else {
    this.severity = 'Low';
  }
  
  // Update severity if action failed
  if (!this.success && this.severity !== 'Critical') {
    if (this.severity === 'Low') this.severity = 'Medium';
    else if (this.severity === 'Medium') this.severity = 'High';
  }
  
  next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);