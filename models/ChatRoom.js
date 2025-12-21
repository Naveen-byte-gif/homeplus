const mongoose = require('mongoose');

const CHAT_TYPES = ['community_apartment', 'community_wing', 'community_floor', 'community_building', 'personal'];

const chatRoomSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: CHAT_TYPES,
      required: true,
      index: true,
    },
    // For community chats we scope by apartment / building / wing / floor
    apartmentCode: {
      type: String,
      index: true,
      uppercase: true,
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Apartment',
    },
    wing: {
      type: String,
      uppercase: true,
    },
    floorNumber: Number,

    // For personal chats we maintain participants list
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['resident', 'staff', 'admin'],
        },
        // last message the user has seen (for unread count)
        lastReadAt: {
          type: Date,
          default: null,
        },
        isMuted: {
          type: Boolean,
          default: false,
        },
        isArchived: {
          type: Boolean,
          default: false,
        },
        deletedAt: {
          type: Date,
          default: null,
        },
      },
    ],

    // For UI
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    avatarUrl: String,

    // Admin controls
    isAnnouncementOnly: {
      type: Boolean,
      default: false,
    },
    pinnedMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },

    // Last activity for ordering chat list
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastMessagePreview: {
      text: String,
      senderName: String,
      createdAt: Date,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure there is only one personal chat per user pair (order independent)
chatRoomSchema.index(
  {
    type: 1,
    'participants.user': 1,
  },
  {
    partialFilterExpression: { type: 'personal' },
  }
);

// Community chat uniqueness per scope
chatRoomSchema.index(
  {
    type: 1,
    apartmentCode: 1,
    wing: 1,
    floorNumber: 1,
  },
  {
    partialFilterExpression: { type: { $in: ['community_apartment', 'community_wing', 'community_floor', 'community_building'] } },
  }
);

module.exports = mongoose.model('ChatRoom', chatRoomSchema);


