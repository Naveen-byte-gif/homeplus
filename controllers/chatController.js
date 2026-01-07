const { CommunityChat, P2PChat, ComplaintChat } = require('../models/Chat');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const { emitToRoom, emitToUser, broadcastToApartment } = require('../services/socketService');
const { sendUserNotification, sendApartmentNotification } = require('../services/notificationService');
const { sendUrgentNotice } = require('../services/smsService');
const { cloudinaryUtils } = require('../config/cloudinary');

// Emergency keywords detection
const EMERGENCY_KEYWORDS = ['fire', 'gas leak', 'theft', 'flood', 'short circuit', 'emergency', 'urgent', 'help'];

// Check if message contains emergency keywords
const containsEmergencyKeywords = (text) => {
  const lowerText = text.toLowerCase();
  return EMERGENCY_KEYWORDS.filter(keyword => lowerText.includes(keyword.toLowerCase()));
};

// Helper to get chat room name
const getChatRoomName = (chat) => {
  if (chat.chatType === 'community') {
    return `community_${chat.apartmentCode}`;
  } else if (chat.chatType === 'wing') {
    return `wing_${chat.apartmentCode}_${chat.wing}`;
  } else if (chat.chatType === 'block') {
    return `block_${chat.apartmentCode}_${chat.block}`;
  } else if (chat.chatType === 'floor') {
    return `floor_${chat.apartmentCode}_${chat.floorNumber}`;
  }
  return `community_${chat.apartmentCode}`;
};

// ==================== COMMUNITY CHAT ====================

// @desc    Get or create community chat
// @route   GET /api/chat/community
// @access  Private
const getCommunityChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user || !user.apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'User must belong to an apartment'
      });
    }

    const { chatType = 'community', wing, block, floorNumber } = req.query;

    let chat = await CommunityChat.findOne({
      apartmentCode: user.apartmentCode,
      chatType,
      ...(wing && { wing }),
      ...(block && { block }),
      ...(floorNumber && { floorNumber: parseInt(floorNumber) })
    });

    if (!chat) {
      chat = await CommunityChat.create({
        apartmentCode: user.apartmentCode,
        chatType,
        wing: wing || null,
        block: block || null,
        floorNumber: floorNumber ? parseInt(floorNumber) : null,
        messages: []
      });
    }

    // Get online users count
    const onlineCount = chat.onlineUsers.length;

    res.status(200).json({
      success: true,
      data: {
        chat: {
          ...chat.toObject(),
          onlineCount
        }
      }
    });
  } catch (error) {
    console.error('Get community chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching community chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Send message to community chat
// @route   POST /api/chat/community/message
// @access  Private
const sendCommunityMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user || !user.apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'User must belong to an apartment'
      });
    }

    const { messageText, messageType = 'text', mediaUrl, chatType = 'community', wing, block, floorNumber } = req.body;

    if (!messageText && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Message text or media is required'
      });
    }

    // Get or create chat
    let chat = await CommunityChat.findOne({
      apartmentCode: user.apartmentCode,
      chatType,
      ...(wing && { wing }),
      ...(block && { block }),
      ...(floorNumber && { floorNumber: parseInt(floorNumber) })
    });

    if (!chat) {
      chat = await CommunityChat.create({
        apartmentCode: user.apartmentCode,
        chatType,
        wing: wing || null,
        block: block || null,
        floorNumber: floorNumber ? parseInt(floorNumber) : null,
        messages: []
      });
    }

    // Check for emergency keywords
    const emergencyKeywords = containsEmergencyKeywords(messageText || '');
    const isEmergency = emergencyKeywords.length > 0;

    // Create message
    const message = {
      messageId: `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId: userId,
      senderName: user.fullName,
      senderRole: user.role,
      messageType,
      messageText: messageText || '',
      mediaUrl: mediaUrl || null,
      mediaPublicId: null,
      reactions: [],
      isEmergency,
      emergencyKeywords
    };

    chat.messages.push(message);
    await chat.save();

    // Emit to room
    const roomName = getChatRoomName(chat);
    emitToRoom(roomName, 'new_community_message', {
      chatId: chat._id,
      message
    });

    // Send notifications
    if (isEmergency) {
      // Emergency: Send to all apartment members + SMS to admins
      await sendApartmentNotification(user.apartmentCode, 'emergency_message', {
        title: '🚨 Emergency Alert',
        message: `${user.fullName}: ${messageText}`,
        apartmentCode: user.apartmentCode
      });

      // Send SMS to admins
      const admins = await User.find({ 
        apartmentCode: user.apartmentCode, 
        role: 'admin',
        'notificationPreferences.sms': true
      });
      for (const admin of admins) {
        await sendUrgentNotice(admin.phoneNumber, `Emergency alert in community chat: ${messageText.substring(0, 50)}`);
      }
    } else {
      // Regular notification
      await sendApartmentNotification(user.apartmentCode, 'community_message', {
        title: `${user.fullName} posted in ${chatType} chat`,
        message: messageText || 'Sent an image',
        apartmentCode: user.apartmentCode
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message }
    });
  } catch (error) {
    console.error('Send community message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Pin/unpin message (Admin only)
// @route   PUT /api/chat/community/message/:messageId/pin
// @access  Private (Admin)
const pinCommunityMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can pin messages'
      });
    }

    const { messageId } = req.params;
    const { chatId, isPinned } = req.body;

    const chat = await CommunityChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const message = chat.messages.id(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    message.isPinned = isPinned !== undefined ? isPinned : !message.isPinned;
    message.pinnedAt = message.isPinned ? new Date() : null;
    message.pinnedBy = message.isPinned ? userId : null;

    await chat.save();

    const roomName = getChatRoomName(chat);
    emitToRoom(roomName, 'message_pinned', {
      chatId: chat._id,
      messageId,
      isPinned: message.isPinned
    });

    res.status(200).json({
      success: true,
      message: `Message ${message.isPinned ? 'pinned' : 'unpinned'} successfully`,
      data: { message }
    });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error pinning message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Add reaction to message
// @route   POST /api/chat/community/message/:messageId/reaction
// @access  Private
const addReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { chatId, emoji } = req.body;

    if (!['👍', '❤️', '😡', '🙏', '😊', '😢'].includes(emoji)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emoji'
      });
    }

    const chat = await CommunityChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const message = chat.messages.id(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Remove existing reaction from user
    message.reactions = message.reactions.filter(r => r.userId.toString() !== userId);
    // Add new reaction
    message.reactions.push({ userId, emoji });
    await chat.save();

    const roomName = getChatRoomName(chat);
    emitToRoom(roomName, 'message_reaction', {
      chatId: chat._id,
      messageId,
      reactions: message.reactions
    });

    res.status(200).json({
      success: true,
      data: { reactions: message.reactions }
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding reaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== P2P CHAT ====================

// @desc    Get chatable users (users that can be chatted with)
// @route   GET /api/chats/chatable-users
// @access  Private
const getChatableUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user || !user.apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'User must belong to an apartment'
      });
    }

    let users = [];

    // Role-based user filtering
    if (user.role === 'admin') {
      // Admin can chat with: All Residents and All Staff in the apartment
      users = await User.find({
        apartmentCode: user.apartmentCode,
        role: { $in: ['resident', 'staff'] },
        status: 'active',
        _id: { $ne: userId }
      })
        .select('fullName profilePicture role phoneNumber isOnline lastSeen')
        .sort({ fullName: 1 });
    } else if (user.role === 'resident') {
      // Resident can chat with: Other Residents, Staff, and Admin
      users = await User.find({
        apartmentCode: user.apartmentCode,
        role: { $in: ['resident', 'staff', 'admin'] },
        status: 'active',
        _id: { $ne: userId }
      })
        .select('fullName profilePicture role phoneNumber isOnline lastSeen')
        .sort({ role: 1, fullName: 1 }); // Sort by role first, then name
    } else if (user.role === 'staff') {
      // Staff can chat with: All Residents and All Staff in the apartment
      users = await User.find({
        apartmentCode: user.apartmentCode,
        role: { $in: ['resident', 'staff'] },
        status: 'active',
        _id: { $ne: userId }
      })
        .select('fullName profilePicture role phoneNumber isOnline lastSeen')
        .sort({ role: 1, fullName: 1 });
    }

    res.status(200).json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get chatable users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chatable users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get user's P2P chats
// @route   GET /api/chat/p2p
// @access  Private
const getP2PChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await P2PChat.find({
      'participants.userId': userId,
      isActive: true
    })
      .populate('participants.userId', 'fullName profilePicture role')
      .populate('lastMessage.sentBy', 'fullName')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: { chats }
    });
  } catch (error) {
    console.error('Get P2P chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get or create P2P chat with specific user
// @route   GET /api/chat/p2p/:receiverId
// @access  Private
const getP2PChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { receiverId } = req.params;

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Find existing chat
    let chat = await P2PChat.findOne({
      'participants.userId': { $all: [userId, receiverId] },
      isActive: true
    })
      .populate('participants.userId', 'fullName profilePicture role phoneNumber');

    if (!chat) {
      const sender = await User.findById(userId);
      // Create new chat
      chat = await P2PChat.create({
        participants: [
          { userId, role: sender.role },
          { userId: receiverId, role: receiver.role }
        ],
        apartmentCode: sender.apartmentCode || receiver.apartmentCode,
        messages: [],
        unreadCount: {
          [userId]: 0,
          [receiverId]: 0
        }
      });

      await chat.populate('participants.userId', 'fullName profilePicture role phoneNumber');
    }

    res.status(200).json({
      success: true,
      data: { chat }
    });
  } catch (error) {
    console.error('Get P2P chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Send P2P message
// @route   POST /api/chat/p2p/message
// @access  Private
const sendP2PMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId, receiverId, message, mediaUrl, messageType = 'text' } = req.body;

    let chat;
    if (chatId) {
      chat = await P2PChat.findById(chatId);
    } else if (receiverId) {
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: 'Receiver not found'
        });
      }

      const sender = await User.findById(userId);
      chat = await P2PChat.findOne({
        'participants.userId': { $all: [userId, receiverId] },
        isActive: true
      });

      if (!chat) {
        chat = await P2PChat.create({
          participants: [
            { userId, role: sender.role },
            { userId: receiverId, role: receiver.role }
          ],
          apartmentCode: sender.apartmentCode || receiver.apartmentCode,
          messages: [],
          unreadCount: {
            [userId]: 0,
            [receiverId]: 0
          }
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either chatId or receiverId is required'
      });
    }

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Create message
    const newMessage = {
      senderId: userId,
      message: message || '',
      mediaUrl: mediaUrl || null,
      messageType,
      seen: false,
      delivered: false,
      sentAt: new Date()
    };

    chat.messages.push(newMessage);
    chat.lastMessage = {
      text: message || 'Sent an image',
      sentAt: new Date(),
      sentBy: userId
    };

    // Update unread count for receiver
    const otherParticipant = chat.participants.find(p => p.userId.toString() !== userId);
    if (otherParticipant) {
      const currentCount = chat.unreadCount.get(otherParticipant.userId.toString()) || 0;
      chat.unreadCount.set(otherParticipant.userId.toString(), currentCount + 1);
    }

    await chat.save();

    // Emit to both users
    emitToUser(userId, 'p2p_message_sent', {
      chatId: chat._id,
      message: newMessage
    });
    emitToUser(otherParticipant.userId.toString(), 'p2p_message_received', {
      chatId: chat._id,
      message: newMessage
    });

    // Send notification to receiver
    const receiver = await User.findById(otherParticipant.userId);
    if (receiver) {
      await sendUserNotification(receiver._id, 'p2p_message', {
        title: `${req.user.fullName}`,
        message: message || 'Sent an image',
        chatId: chat._id.toString()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message: newMessage, chatId: chat._id }
    });
  } catch (error) {
    console.error('Send P2P message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Mark P2P messages as read
// @route   PUT /api/chat/p2p/:chatId/read
// @access  Private
const markP2PAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    const chat = await P2PChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Mark messages as read
    chat.messages.forEach(msg => {
      if (msg.senderId.toString() !== userId && !msg.seen) {
        msg.seen = true;
        msg.readAt = new Date();
        if (!msg.delivered) {
          msg.delivered = true;
          msg.deliveredAt = new Date();
        }
      }
    });

    // Reset unread count
    chat.unreadCount.set(userId, 0);

    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking messages as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== COMPLAINT CHAT ====================

// @desc    Get complaint chat
// @route   GET /api/chat/complaint/:complaintId
// @access  Private
const getComplaintChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { complaintId } = req.params;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check access
    const user = await User.findById(userId);
    const hasAccess = 
      complaint.createdBy.toString() === userId ||
      user.role === 'admin' ||
      (complaint.assignedTo?.staff && complaint.assignedTo.staff.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this complaint chat'
      });
    }

    let chat = await ComplaintChat.findOne({ complaintId })
      .populate('participants.userId', 'fullName profilePicture role');

    if (!chat) {
      // Create complaint chat
      const participants = [
        { userId: complaint.createdBy, role: 'resident' }
      ];

      if (complaint.assignedTo?.staff) {
        const staff = await User.findById(complaint.assignedTo.staff);
        if (staff) {
          participants.push({ userId: staff._id, role: staff.role });
        }
      }

      // Add admins as observers
      const admins = await User.find({ 
        apartmentCode: complaint.apartmentCode, 
        role: 'admin' 
      });
      admins.forEach(admin => {
        if (!participants.find(p => p.userId.toString() === admin._id.toString())) {
          participants.push({ userId: admin._id, role: 'admin' });
        }
      });

      chat = await ComplaintChat.create({
        complaintId,
        apartmentCode: complaint.apartmentCode,
        participants,
        messages: []
      });

      await chat.populate('participants.userId', 'fullName profilePicture role');
    }

    res.status(200).json({
      success: true,
      data: { chat }
    });
  } catch (error) {
    console.error('Get complaint chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching complaint chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Send complaint chat message
// @route   POST /api/chat/complaint/message
// @access  Private
const sendComplaintMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { complaintId, message, mediaUrl, messageType = 'text', isInternalNote = false } = req.body;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const user = await User.findById(userId);
    const hasAccess = 
      complaint.createdBy.toString() === userId ||
      user.role === 'admin' ||
      (complaint.assignedTo?.staff && complaint.assignedTo.staff.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only staff/admin can send internal notes
    if (isInternalNote && user.role === 'resident') {
      return res.status(403).json({
        success: false,
        message: 'Only staff and admins can send internal notes'
      });
    }

    let chat = await ComplaintChat.findOne({ complaintId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Complaint chat not found. Please get the chat first.'
      });
    }

    // Create message
    const newMessage = {
      senderId: userId,
      senderRole: user.role,
      message: message || '',
      mediaUrl: mediaUrl || null,
      messageType: isInternalNote ? 'internal_note' : messageType,
      isInternalNote,
      sentAt: new Date()
    };

    chat.messages.push(newMessage);
    await chat.save();

    // Emit to all participants (except sender)
    chat.participants.forEach(participant => {
      if (participant.userId.toString() !== userId) {
        emitToUser(participant.userId.toString(), 'complaint_message', {
          complaintId,
          message: newMessage,
          isInternalNote: isInternalNote // Internal notes only visible to staff/admin
        });
      }
    });

    // Send notifications to other participants (not internal notes)
    if (!isInternalNote) {
      chat.participants.forEach(async (participant) => {
        if (participant.userId.toString() !== userId) {
          await sendUserNotification(participant.userId, 'complaint_message', {
            title: `New message on complaint ${complaint.ticketNumber}`,
            message: message || 'Sent an image',
            complaintId: complaintId.toString()
          });
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message: newMessage }
    });
  } catch (error) {
    console.error('Send complaint message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Upload chat image
// @route   POST /api/chat/upload-image
// @access  Private
const uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: req.file.path,
        publicId: req.file.filename
      }
    });
  } catch (error) {
    console.error('Upload chat image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
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
};

