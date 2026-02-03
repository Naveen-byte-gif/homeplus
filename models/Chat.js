const mongoose = require('mongoose');

// Chat Message Schema
const chatMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    default: () => `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['resident', 'admin', 'staff'],
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'poll', 'announcement'],
    default: 'text'
  },
  messageText: {
    type: String,
    required: false, // Optional - validation handled in controller based on messageType
    trim: true,
    maxlength: [5000, 'Message cannot exceed 5000 characters'],
    default: '' // Allow empty string for image messages
  },
  mediaUrl: {
    type: String,
    default: null
  },
  mediaPublicId: {
    type: String,
    default: null
  },
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      enum: ['👍', '❤️', '😡', '🙏', '😊', '😢'],
      required: true
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date,
    default: null
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  emergencyKeywords: [String],
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Community Chat Schema
const communityChatSchema = new mongoose.Schema({
  apartmentCode: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  chatType: {
    type: String,
    enum: ['community', 'wing', 'block', 'floor'],
    default: 'community'
  },
  wing: {
    type: String,
    uppercase: true,
    default: null
  },
  block: {
    type: String,
    uppercase: true,
    default: null
  },
  floorNumber: {
    type: Number,
    default: null
  },
  messages: [chatMessageSchema],
  onlineUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  mutedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    mutedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// P2P Chat Schema
const p2pChatSchema = new mongoose.Schema({
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['resident', 'admin', 'staff'],
      required: true
    }
  }],
  apartmentCode: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  messages: [{
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: false,
      trim: true,
      maxlength: [5000, 'Message cannot exceed 5000 characters'],
      validate: {
        validator: function(value) {
          // For text messages, message must be provided and non-empty
          if (this.messageType === 'text') {
            return value != null && value !== undefined && value.toString().trim().length > 0;
          }
          // Allow empty string, null, or undefined for non-text messages
          return true;
        },
        message: 'Message text is required for text messages'
      }
    },
    mediaUrl: {
      type: String,
      default: null
    },
    mediaPublicId: {
      type: String,
      default: null
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text'
    },
    seen: {
      type: Boolean,
      default: false
    },
    delivered: {
      type: Boolean,
      default: false
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  }],
  lastMessage: {
    text: String,
    sentAt: Date,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Complaint Chat Schema
const complaintChatSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true,
    unique: true,
    index: true
  },
  apartmentCode: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['resident', 'admin', 'staff'],
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  messages: [{
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['resident', 'admin', 'staff'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [5000, 'Message cannot exceed 5000 characters']
    },
    mediaUrl: {
      type: String,
      default: null
    },
    mediaPublicId: {
      type: String,
      default: null
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'status_update', 'internal_note'],
      default: 'text'
    },
    statusUpdate: {
      oldStatus: String,
      newStatus: String
    },
    isInternalNote: {
      type: Boolean,
      default: false
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    isEdited: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
communityChatSchema.index({ apartmentCode: 1, chatType: 1, wing: 1, block: 1, floorNumber: 1 });
p2pChatSchema.index({ 'participants.userId': 1 });
p2pChatSchema.index({ apartmentCode: 1 });
complaintChatSchema.index({ complaintId: 1 });

// Helper method to get chat room name
communityChatSchema.methods.getRoomName = function() {
  if (this.chatType === 'community') {
    return `community_${this.apartmentCode}`;
  } else if (this.chatType === 'wing') {
    return `wing_${this.apartmentCode}_${this.wing}`;
  } else if (this.chatType === 'block') {
    return `block_${this.apartmentCode}_${this.block}`;
  } else if (this.chatType === 'floor') {
    return `floor_${this.apartmentCode}_${this.floorNumber}`;
  }
  return `community_${this.apartmentCode}`;
};

const CommunityChat = mongoose.model('CommunityChat', communityChatSchema);
const P2PChat = mongoose.model('P2PChat', p2pChatSchema);
const ComplaintChat = mongoose.model('ComplaintChat', complaintChatSchema);

module.exports = {
  CommunityChat,
  P2PChat,
  ComplaintChat
};

