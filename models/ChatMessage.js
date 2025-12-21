const mongoose = require('mongoose');

const MESSAGE_TYPES = ['text', 'image', 'system'];

const chatMessageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      default: 'text',
    },
    text: {
      type: String,
      trim: true,
    },
    media: {
      url: String,
      publicId: String,
      mimeType: String,
      size: Number,
      width: Number,
      height: Number,
    },
    // Message meta
    isEdited: {
      type: Boolean,
      default: false,
    },
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Read receipts (per-user)
    deliveredTo: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        at: Date,
      },
    ],
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        at: Date,
      },
    ],
    systemMeta: {
      // e.g. admin joined, rules updated, status messages
      kind: String,
      payload: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

chatMessageSchema.index({ chatRoom: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);


