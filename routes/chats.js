const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  // Community Chat
  getCommunityChat,
  sendCommunityMessage,
  pinCommunityMessage,
  addReaction,
  // P2P Chat
  getChatableUsers,
  getP2PChats,
  getP2PChat,
  sendP2PMessage,
  markP2PAsRead,
  // Complaint Chat
  getComplaintChat,
  sendComplaintMessage,
  // Utils
  uploadChatImage
} = require('../controllers/chatController');
const { uploadConfigs, handleUploadError } = require('../config/cloudinary');

// ==================== COMMUNITY CHAT ROUTES ====================

// @route   GET /api/chats/community
// @desc    Get or create community chat
// @access  Private
router.get('/community', protect, getCommunityChat);

// @route   POST /api/chats/community/message
// @desc    Send message to community chat
// @access  Private
router.post('/community/message', protect, sendCommunityMessage);

// @route   PUT /api/chats/community/message/:messageId/pin
// @desc    Pin/unpin message (Admin only)
// @access  Private (Admin)
router.put('/community/message/:messageId/pin', protect, pinCommunityMessage);

// @route   POST /api/chats/community/message/:messageId/reaction
// @desc    Add reaction to message
// @access  Private
router.post('/community/message/:messageId/reaction', protect, addReaction);

// ==================== P2P CHAT ROUTES ====================

// @route   GET /api/chats/chatable-users
// @desc    Get chatable users (users that can be chatted with based on role)
// @access  Private
router.get('/chatable-users', protect, getChatableUsers);

// @route   GET /api/chats/p2p
// @desc    Get user's P2P chats
// @access  Private
router.get('/p2p', protect, getP2PChats);

// @route   GET /api/chats/p2p/:receiverId
// @desc    Get or create P2P chat with specific user
// @access  Private
router.get('/p2p/:receiverId', protect, getP2PChat);

// @route   POST /api/chats/p2p/message
// @desc    Send P2P message
// @access  Private
router.post('/p2p/message', protect, sendP2PMessage);

// @route   PUT /api/chats/p2p/:chatId/read
// @desc    Mark P2P messages as read
// @access  Private
router.put('/p2p/:chatId/read', protect, markP2PAsRead);

// ==================== COMPLAINT CHAT ROUTES ====================

// @route   GET /api/chats/complaint/:complaintId
// @desc    Get complaint chat
// @access  Private
router.get('/complaint/:complaintId', protect, getComplaintChat);

// @route   POST /api/chats/complaint/message
// @desc    Send complaint chat message
// @access  Private
router.post('/complaint/message', protect, sendComplaintMessage);

// ==================== UTILITY ROUTES ====================

// @route   POST /api/chats/upload-image
// @desc    Upload chat image
// @access  Private
router.post(
  '/upload-image',
  protect,
  uploadConfigs.chatImages.single('image'),
  handleUploadError,
  uploadChatImage
);

module.exports = router;

