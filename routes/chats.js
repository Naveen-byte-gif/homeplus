const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const {
  getMyChats,
  getMessages,
  sendMessage,
  markAsRead,
  getOrCreatePersonalChatEndpoint,
  getOrCreateCommunityChat,
  getResidentsForChat,
  uploadChatMedia,
} = require('../controllers/chatController');
const { uploadConfigs } = require('../config/cloudinary');

// All chat routes require authentication
router.use(protect);

// List chats for current user
router.get('/', getMyChats);

// Get or create a personal chat with another user
router.post('/personal/:userId', getOrCreatePersonalChatEndpoint);

// Get or create community chat for an apartment
router.get('/community/:apartmentCode', getOrCreateCommunityChat);

// Get residents for admin to chat with
router.get('/residents', getResidentsForChat);

// Upload chat media
router.post('/upload-media', protect, uploadConfigs.chatImages.single('image'), uploadChatMedia);

// Admin broadcast
router.post('/admin/broadcast', require('../middleware/roleCheck').checkRole(['admin']), require('../controllers/chatController').adminBroadcast);

// Messages in a chat
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', sendMessage);

// Search messages
router.get('/:chatId/search', require('../controllers/chatController').searchMessages);

// Mark messages as read
router.post('/:chatId/read', markAsRead);

// Mark message as delivered
router.post('/messages/:messageId/delivered', require('../controllers/chatController').markMessageDelivered);

module.exports = router;


