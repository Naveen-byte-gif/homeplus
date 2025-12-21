const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { emitToRoom, emitToUser } = require('../services/socketService');

// Utility to ensure a personal chat exists between two users
const getOrCreatePersonalChat = async (userId, otherUserId) => {
  const participants = [userId.toString(), otherUserId.toString()].sort();

  let chat = await ChatRoom.findOne({
    type: 'personal',
    'participants.user': { $all: participants },
  });

  if (!chat) {
    const users = await User.find({ _id: { $in: participants } });
    const self = users.find((u) => u._id.toString() === userId.toString());
    const other = users.find((u) => u._id.toString() === otherUserId.toString());

    const name = other ? other.fullName : 'Personal Chat';

    chat = await ChatRoom.create({
      type: 'personal',
      name,
      participants: users.map((u) => ({
        user: u._id,
        role: u.role,
      })),
      createdBy: self ? self._id : userId,
    });
  }

  return chat;
};

// Utility to get or create community chat for an apartment
const getOrCreateCommunityChat = async (apartmentCode, userId) => {
  let chat = await ChatRoom.findOne({
    type: 'community_apartment',
    apartmentCode: apartmentCode,
    isActive: true,
  });

  if (!chat) {
    const user = await User.findById(userId);
    // Create community chat accessible to all residents and owners in the apartment
    chat = await ChatRoom.create({
      type: 'community_apartment',
      apartmentCode: apartmentCode,
      name: `Community chat all residents and Owners`,
      description: `Community chat for all residents and owners in ${apartmentCode}`,
      createdBy: userId,
      // Note: For community chats, we don't maintain a participants list
      // All users with the same apartmentCode can access it
      participants: user ? [{
        user: user._id,
        role: user.role,
      }] : [],
    });
  }

  return chat;
};

// List chats for current user (with simple filters)
exports.getMyChats = async (req, res, next) => {
  try {
    const { filter, apartmentCode } = req.query; // all | community | personal | unread
    const userId = req.user._id;
    const userApartmentCode = req.user.apartmentCode || apartmentCode;

    // Auto-create community chat for apartment if it doesn't exist and user has apartmentCode
    if (userApartmentCode) {
      await getOrCreateCommunityChat(userApartmentCode, userId);
    }

    const baseQuery = {
      isActive: true,
      $or: [
        // Community chats - show all community chats for user's apartment
        ...(userApartmentCode ? [{
          type: { $in: ['community_apartment', 'community_wing', 'community_floor', 'community_building'] },
          apartmentCode: userApartmentCode,
        }] : []),
        // Personal chats
        { type: 'personal', 'participants.user': userId },
      ],
    };

    if (filter === 'community') {
      baseQuery.type = { $in: ['community_apartment', 'community_wing', 'community_floor', 'community_building'] };
      delete baseQuery.$or;
      if (userApartmentCode) {
        baseQuery.apartmentCode = userApartmentCode;
      }
    } else if (filter === 'personal') {
      baseQuery.type = 'personal';
      delete baseQuery.$or;
      baseQuery['participants.user'] = userId;
    }

    const chats = await ChatRoom.find(baseQuery)
      .sort({ lastMessageAt: -1 })
      .lean();

    // Compute unread counts for personal chats
    const chatIds = chats.map((c) => c._id);
    const latestMessages = await ChatMessage.aggregate([
      { $match: { chatRoom: { $in: chatIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$chatRoom',
          lastMessageAt: { $first: '$createdAt' },
        },
      },
    ]);

    const lastMap = new Map(latestMessages.map((m) => [m._id.toString(), m.lastMessageAt]));

    const result = chats.map((chat) => {
      const lastReadEntry =
        chat.participants?.find((p) => p.user.toString() === userId.toString())?.lastReadAt || null;

      const lastAt = chat.lastMessageAt || lastMap.get(chat._id.toString()) || chat.updatedAt;

      const unread = lastReadEntry
        ? lastAt && lastAt > lastReadEntry
        : !!lastAt; // if never read and has messages -> unread

      return {
        id: chat._id,
        type: chat.type,
        name: chat.name,
        description: chat.description,
        avatarUrl: chat.avatarUrl,
        lastMessageAt: lastAt,
        lastMessagePreview: chat.lastMessagePreview || null,
        isAnnouncementOnly: chat.isAnnouncementOnly,
        unread,
      };
    });

    const filtered =
      filter === 'unread' ? result.filter((c) => c.unread) : result;

    res.status(200).json({
      success: true,
      data: {
        chats: filtered,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get messages for a given chat
exports.getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { before, limit = 50 } = req.query;
    const userId = req.user._id;

    const chat = await ChatRoom.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Simple auth: user must be participant or same apartment for community chat
    if (chat.type === 'personal') {
      const isParticipant = chat.participants.some(
        (p) => p.user.toString() === userId.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    } else if (chat.apartmentCode) {
      // For community chats: user must have same apartment code OR be admin
      if (req.user.role !== 'admin' && chat.apartmentCode !== req.user.apartmentCode) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    }

    const query = { chatRoom: chat._id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('sender', 'fullName role')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // chronological
      },
    });
  } catch (error) {
    next(error);
  }
};

// Upload chat media
exports.uploadChatMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // multer-storage-cloudinary stores Cloudinary result in req.file
    // path = secure_url, filename = public_id
    const file = req.file;
    
    // Extract Cloudinary metadata if available
    // CloudinaryStorage may store additional info in the file object
    const mediaData = {
      url: file.path, // This is the secure_url from Cloudinary
      publicId: file.filename || file.public_id, // This is the public_id
      mimeType: file.mimetype,
      size: file.size,
    };

    // Try to extract width and height if available
    // These might be in the file object or need to be fetched from Cloudinary
    if (file.width) mediaData.width = file.width;
    if (file.height) mediaData.height = file.height;
    
    res.status(200).json({
      success: true,
      data: {
        media: mediaData,
      },
    });
  } catch (error) {
    console.error('Error uploading chat media:', error);
    next(error);
  }
};

// Send a new message (text or image)
exports.sendMessage = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { text, type = 'text', media } = req.body;
    const userId = req.user._id;

    const chat = await ChatRoom.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Auth checks as in getMessages
    if (chat.type === 'personal') {
      const isParticipant = chat.participants.some(
        (p) => p.user.toString() === userId.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    } else if (chat.apartmentCode) {
      // For community chats: user must have same apartment code OR be admin
      if (req.user.role !== 'admin' && chat.apartmentCode !== req.user.apartmentCode) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    }

    // Build message data
    const messageData = {
      chatRoom: chat._id,
      sender: userId,
      type: type || (media && media.url ? 'image' : 'text'),
      deliveredTo: [],
      readBy: [
        {
          user: userId,
          at: new Date(),
        },
      ],
    };

    // Add text if provided
    if (text && text.trim() !== '') {
      messageData.text = text;
    }

    // Only add media if it exists and has a valid URL
    if (media && media.url && media.url.trim() !== '') {
      messageData.media = media;
    }

    const message = await ChatMessage.create(messageData);

    // Update chat preview and lastMessageAt
    chat.lastMessageAt = message.createdAt;
    chat.lastMessagePreview = {
      text: message.type === 'text' && message.text 
        ? message.text 
        : message.type === 'image' 
          ? '[Image]' 
          : '[Media]',
      senderName: req.user.fullName,
      createdAt: message.createdAt,
    };
    await chat.save();

    const populated = await message.populate('sender', 'fullName role profilePicture');

    // Emit socket event
    const payload = {
      id: populated._id,
      chatId: chat._id,
      type: populated.type,
      text: populated.text,
      sender: {
        id: populated.sender._id,
        name: populated.sender.fullName,
        role: populated.sender.role,
        profilePicture: populated.sender.profilePicture,
      },
      createdAt: populated.createdAt,
      isEdited: populated.isEdited,
    };

    // Only include media if it exists and has a valid URL
    if (populated.media && populated.media.url && populated.media.url.trim() !== '') {
      payload.media = populated.media;
    }

    if (chat.type === 'personal') {
      chat.participants.forEach((p) => {
        emitToUser(p.user.toString(), 'chat_message', payload);
      });
    } else {
      emitToRoom(`apartment_${chat.apartmentCode}`, 'chat_message', payload);
    }

    res.status(201).json({
      success: true,
      data: {
        message: payload,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Mark messages as read in a chat
exports.markAsRead = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await ChatRoom.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const participant = chat.participants.find(
      (p) => p.user.toString() === userId.toString()
    );

    if (!participant && chat.type === 'personal') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    const now = new Date();

    if (participant) {
      participant.lastReadAt = now;
      await chat.save();
    }

    await ChatMessage.updateMany(
      {
        chatRoom: chat._id,
        'readBy.user': { $ne: userId },
      },
      {
        $push: {
          readBy: {
            user: userId,
            at: now,
          },
        },
      }
    );

    // Emit socket event for read receipts (personal chats only)
    if (chat.type === 'personal') {
      chat.participants.forEach((p) => {
        emitToUser(p.user.toString(), 'chat_read', {
          chatId: chat._id,
          userId,
          readAt: now,
        });
      });
    }

    res.status(200).json({
      success: true,
      data: {
        chatId: chat._id,
        readAt: now,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Simple endpoint to get or create a personal chat with another user
exports.getOrCreatePersonalChatEndpoint = async (req, res, next) => {
  try {
    const { userId: otherUserId } = req.params;
    const userId = req.user._id;

    if (userId.toString() === otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create chat with yourself',
      });
    }

    const other = await User.findById(otherUserId);
    if (!other) {
      return res.status(404).json({
        success: false,
        message: 'Other user not found',
      });
    }

    const chat = await getOrCreatePersonalChat(userId, otherUserId);

    res.status(200).json({
      success: true,
      data: {
        chat: {
          id: chat._id,
          type: chat.type,
          name: chat.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get or create community chat for an apartment
exports.getOrCreateCommunityChat = async (req, res, next) => {
  try {
    const { apartmentCode } = req.params;
    const userId = req.user._id;
    const userApartmentCode = req.user.apartmentCode;

    // Validate apartment code
    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required',
      });
    }

    // User must have same apartment code
    if (apartmentCode !== userApartmentCode) {
      return res.status(403).json({
        success: false,
        message: 'Not allowed to access this apartment\'s community chat',
      });
    }

    const chat = await getOrCreateCommunityChat(apartmentCode.toUpperCase(), userId);

    res.status(200).json({
      success: true,
      data: {
        chat: {
          id: chat._id,
          type: chat.type,
          name: chat.name,
          description: chat.description,
          apartmentCode: chat.apartmentCode,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get users for chat (same apartment)
exports.getResidentsForChat = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const userApartmentCode = req.user.apartmentCode;
    const { apartmentCode, search } = req.query;

    // Build filter
    const filter = {
      status: 'active',
      _id: { $ne: userId }, // Exclude current user
    };

    // For admin: show all residents (can optionally filter by apartmentCode)
    // For residents/staff: show only same apartment
    if (userRole === 'admin') {
      const Apartment = require('../models/Apartment');
      
      // Admin can see all residents, optionally filtered by apartmentCode
      if (apartmentCode) {
        // Filter by specific apartment code
        filter.apartmentCode = apartmentCode.toUpperCase();
      } else {
        // Get all buildings created by this admin
        const adminBuildings = await Apartment.find({
          createdBy: userId,
          isActive: true,
        }).select('code').lean();
        
        const buildingCodes = adminBuildings.map((b) => b.code);
        
        if (buildingCodes.length > 0) {
          // Show all residents from admin's buildings
          filter.apartmentCode = { $in: buildingCodes };
          filter.role = { $in: ['resident', 'staff', 'owner'] };
        } else {
          // No buildings found - return empty
          return res.status(200).json({
            success: true,
            data: {
              users: [],
              total: 0,
            },
          });
        }
      }
    } else {
      // Non-admin users: only same apartment
      const targetApartmentCode = apartmentCode?.toUpperCase() || userApartmentCode;
      if (!targetApartmentCode) {
        return res.status(200).json({
          success: true,
          data: {
            users: [],
            total: 0,
          },
        });
      }
      filter.apartmentCode = targetApartmentCode;
    }

    // Add search filter if provided
    if (search && search.trim()) {
      filter.$or = [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { phoneNumber: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('_id fullName phoneNumber email apartmentCode flatNumber floorNumber flatType profilePicture role status isOnline lastSeen')
      .sort({ fullName: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u._id,
          _id: u._id,
          fullName: u.fullName,
          phoneNumber: u.phoneNumber,
          email: u.email,
          apartmentCode: u.apartmentCode,
          flatNumber: u.flatNumber,
          floorNumber: u.floorNumber,
          flatType: u.flatType,
          profilePicture: u.profilePicture,
          role: u.role,
          status: u.status,
          isOnline: u.isOnline || false,
          lastSeen: u.lastSeen || u.updatedAt,
        })),
        total: users.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Search messages in a chat
exports.searchMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { query, limit = 50 } = req.query;
    const userId = req.user._id;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    const chat = await ChatRoom.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Auth checks
    if (chat.type === 'personal') {
      const isParticipant = chat.participants.some(
        (p) => p.user.toString() === userId.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    } else if (chat.apartmentCode) {
      if (chat.apartmentCode !== req.user.apartmentCode) {
        return res.status(403).json({ success: false, message: 'Not allowed' });
      }
    }

    const messages = await ChatMessage.find({
      chatRoom: chat._id,
      text: { $regex: query.trim(), $options: 'i' },
      deletedForEveryone: false,
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('sender', 'fullName role profilePicture')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(),
        total: messages.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin broadcast message to all users in an apartment
exports.adminBroadcast = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can broadcast messages',
      });
    }

    const { apartmentCode, text, type = 'text', media } = req.body;

    if (!apartmentCode) {
      return res.status(400).json({
        success: false,
        message: 'Apartment code is required',
      });
    }

    // Get or create community chat
    const chat = await getOrCreateCommunityChat(apartmentCode.toUpperCase(), req.user._id);

    // Create message
    const message = await ChatMessage.create({
      chatRoom: chat._id,
      sender: req.user._id,
      type,
      text,
      media,
      deliveredTo: [],
      readBy: [
        {
          user: req.user._id,
          at: new Date(),
        },
      ],
    });

    // Update chat preview
    chat.lastMessageAt = message.createdAt;
    chat.lastMessagePreview = {
      text: message.type === 'text' ? message.text : '[Media]',
      senderName: req.user.fullName,
      createdAt: message.createdAt,
    };
    await chat.save();

    const populated = await message.populate('sender', 'fullName role profilePicture');

    // Emit to apartment room
    const payload = {
      id: populated._id,
      chatId: chat._id,
      type: populated.type,
      text: populated.text,
      media: populated.media,
      sender: {
        id: populated.sender._id,
        name: populated.sender.fullName,
        role: populated.sender.role,
        profilePicture: populated.sender.profilePicture,
      },
      createdAt: populated.createdAt,
      isEdited: populated.isEdited,
    };

    emitToRoom(`apartment_${apartmentCode}`, 'chat_message', payload);

    res.status(201).json({
      success: true,
      data: {
        message: payload,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Mark message as delivered
exports.markMessageDelivered = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Check if already delivered
    const alreadyDelivered = message.deliveredTo.some(
      (d) => d.user.toString() === userId.toString()
    );

    if (!alreadyDelivered) {
      message.deliveredTo.push({
        user: userId,
        at: new Date(),
      });
      await message.save();

      // Emit delivery receipt
      const chat = await ChatRoom.findById(message.chatRoom);
      if (chat && chat.type === 'personal') {
        chat.participants.forEach((p) => {
          if (p.user.toString() !== userId.toString()) {
            emitToUser(p.user.toString(), 'message_delivered', {
              messageId: message._id,
              chatId: chat._id,
              userId,
            });
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        messageId: message._id,
        delivered: true,
      },
    });
  } catch (error) {
    next(error);
  }
};


