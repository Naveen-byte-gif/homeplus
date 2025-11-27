const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notice title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Notice content is required']
  },
  category: {
    type: String,
    enum: ['General', 'Maintenance', 'Security', 'Event', 'Emergency', 'Payment'],
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Expired', 'Archived'],
    default: 'Draft'
  },
  targetAudience: {
    type: {
      type: String,
      enum: ['All', 'Specific'],
      required: true
    },
    wings: [String],
    floors: [Number],
    flatNumbers: [String]
  },
  schedule: {
    publishAt: { type: Date, default: Date.now },
    expireAt: Date
  },
  attachments: [{
    name: String,
    url: String,
    publicId: String,
    type: String,
    size: Number
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  engagement: {
    totalSent: { type: Number, default: 0 },
    totalRead: { type: Number, default: 0 },
    readPercentage: { type: Number, default: 0 }
  },
  requiresAcknowledgement: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
noticeSchema.index({ status: 1, 'schedule.publishAt': 1 });
noticeSchema.index({ category: 1, priority: 1 });
noticeSchema.index({ 'schedule.expireAt': 1 });

// Pre-save middleware to calculate engagement
noticeSchema.pre('save', function(next) {
  if (this.readBy.length > 0 && this.engagement.totalSent > 0) {
    this.engagement.totalRead = this.readBy.length;
    this.engagement.readPercentage = (this.readBy.length / this.engagement.totalSent) * 100;
  }
  next();
});

// Method to mark as read by user
noticeSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(read => read.user.toString() === userId.toString());
  
  if (!alreadyRead) {
    this.readBy.push({ user: userId });
    await this.save();
  }
  
  return this;
};

// Static method to get active notices
noticeSchema.statics.getActiveNotices = function() {
  const now = new Date();
  return this.find({
    status: 'Published',
    'schedule.publishAt': { $lte: now },
    $or: [
      { 'schedule.expireAt': { $gt: now } },
      { 'schedule.expireAt': { $exists: false } }
    ]
  }).sort({ 'schedule.publishAt': -1 });
};

module.exports = mongoose.model('Notice', noticeSchema);