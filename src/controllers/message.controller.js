import User from "../models/User.model.js";
import Message from "../models/Message.model.js";
import cloudinary from "../lib/cloudinary.js";
import mongoose from "mongoose";
import { getReceiverSocketId, io } from "../lib/socket.js";
import FriendRequest from "../models/FriendRequest.model.js";
import { validateFriendship, removeFriendshipCompletely } from "../lib/RemoveFriend.js";
import { sendNotification, NotificationTypes } from "../services/notification/notification.handler.js";

export const getUsersForSiderbar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    
    // Get friends using the FriendRequest model method
    const friends = await FriendRequest.getFriends(loggedInUserId);
    
    // Get current user to check blocking status
    const currentUser = await User.findById(loggedInUserId);
    
    // Add last message info and unread count for each friend
    const friendsWithLastMessage = await Promise.all(
      friends.map(async (friend) => {
        // Check if this friend is blocked by current user or has blocked current user
        const isBlocked = currentUser.isBlocked(friend._id);
        const isBlockedBy = friend.blockedUsers && friend.blockedUsers.includes(loggedInUserId);
        
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: friend._id },
            { senderId: friend._id, receiverId: loggedInUserId },
          ],
        }).sort({ createdAt: -1 });

        // Get unread message count from this friend
        const unreadCount = await Message.countDocuments({
          senderId: friend._id,
          receiverId: loggedInUserId,
          isRead: false
        });
        
        // If blocked by the friend, hide profile info and show "Blocked. Silence is permanent."
        if (isBlockedBy) {
          return {
            ...friend.toObject(),
            profilePic: "", // Hide profile picture
            isOnline: false, // Hide online status
            lastSeen: null, // Hide last seen
            lastMessage: {
              _id: "blocked",
              text: "Blocked. Silence is permanent.",
              createdAt: new Date(),
              senderId: friend._id,
              receiverId: loggedInUserId,
              isRead: true,
              messageType: "system"
            },
            unreadCount: 0,
            isBlocked: false,
            isBlockedBy: true
          };
        }

        return {
          ...friend.toObject(),
          lastMessage: lastMessage ? {
            _id: lastMessage._id,
            text: lastMessage.text || lastMessage.message, // Support both fields
            image: lastMessage.image,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
            receiverId: lastMessage.receiverId,
            isRead: lastMessage.isRead,
            messageType: lastMessage.messageType
          } : null,
          unreadCount: unreadCount,
          isBlocked: isBlocked,
          isBlockedBy: isBlockedBy,
          // Include formatted last seen if not blocked
          formattedLastSeen: !isBlocked && !isBlockedBy ? friend.getFormattedLastSeen() : null
        };
      })
    );

    res.status(200).json(friendsWithLastMessage);
  } catch (error) {
    console.error("Error fetching users for sidebar:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userToChatId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // Validate friendship using the utility function
    const areFriends = await validateFriendship(myId, userToChatId);
    if (!areFriends) {
      return res.status(403).json({ 
        message: "Can only message friends. Please send a friend request first." 
      });
    }

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 }); // Sort by creation time ascending

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver ID format" });
    }

// Validate that both text and image are not empty
    if (!text && !image) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    // Validate friendship before allowing message
    const areFriends = await validateFriendship(senderId, receiverId);
    if (!areFriends) {
      return res.status(403).json({ 
        message: "Can only message friends. Please send a friend request first." 
      });
    }
    
    // Check if sender is blocked by receiver
    const receiver = await User.findById(receiverId);
    const sender = await User.findById(senderId);
    
    if (!receiver || !sender) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // If receiver has blocked sender, silently discard the message
    if (receiver.isBlocked(senderId)) {
      console.log(`Message from ${senderId} to ${receiverId} silently discarded - sender is blocked`);
      // Return success response to sender but don't actually send/store the message
      return res.status(200).json({ 
        message: "Message sent successfully", 
        silentlyDiscarded: true 
      });
    }

    let imageUrl;
    if (image) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(image);
        imageUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        return res.status(500).json({ message: "Failed to upload image" });
      }
    }

    // Create conversationId using the static method
    const conversationId = Message.createConversationId(senderId, receiverId);

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      conversationId, // Add this required field
      messageType: image ? 'image' : 'text', // Set appropriate message type
      isRead: false, // Explicitly set new messages as unread
    });

    await newMessage.save();

    // Check if receiver is currently in the same chat (to avoid notification if they're actively chatting)
    const receiverSocketId = getReceiverSocketId(receiverId.toString());
    const isReceiverInCurrentChat = receiverSocketId && io.sockets.sockets.get(receiverSocketId)?.currentChatId === conversationId;
    
    // Send real-time message to receiver
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('newMessage', newMessage);
      
      // If receiver is in the same chat, no notification needed
      if (isReceiverInCurrentChat) {
        console.log(`📱 Message delivered via socket, no notification sent (user in same chat)`);
      }
    }
    
    // Send enhanced notification only if receiver is offline or not in the same chat
    if (!receiverSocketId || !isReceiverInCurrentChat) {
      const notificationTitle = sender.fullname;
      const notificationBody = text || 'Image';
      
      await sendNotification({
        userId: receiverId,
        type: NotificationTypes.NEW_MESSAGE,
        title: notificationTitle,
        body: notificationBody,
        data: {
          senderId: senderId.toString(),
          senderName: sender.fullname,
          senderProfilePic: sender.profilePic || '',
          messageId: newMessage._id.toString(),
          conversationId: conversationId,
          messageType: newMessage.messageType,
          attachmentUrl: imageUrl || null,
          timestamp: newMessage.createdAt.toISOString()
        },
        priority: 'high'
      });
    }

    // Also emit to sender for confirmation (useful for multiple device scenarios)
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageSent", {
        messageId: newMessage._id,
        receiverId: receiverId,
        status: "delivered"
      });
    }

    res.status(200).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete all messages between two users
export const deleteMessagesWithUser = async (req, res) => {
  try {
    const { id: otherUserId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // Delete all messages between these users
    const deletedMessages = await Message.deleteMany({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId },
      ],
    });

    // Emit socket event to both users about chat deletion
    const otherUserSocketId = getReceiverSocketId(otherUserId);
    const mySocketId = getReceiverSocketId(myId);

    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit("chatDeleted", {
        deletedUserId: myId,
        message: "Chat conversation has been deleted"
      });
    }

    if (mySocketId) {
      io.to(mySocketId).emit("chatDeleted", {
        deletedUserId: otherUserId,
        message: "Chat conversation has been deleted"
      });
    }

    res.status(200).json({ 
      message: "Messages deleted successfully",
      deletedCount: deletedMessages.deletedCount
    });
  } catch (error) {
    console.error("Error deleting messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get message count between users
export const getMessageCount = async (req, res) => {
  try {
    const { id: otherUserId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const areFriends = await validateFriendship(myId, otherUserId);
    if (!areFriends) {
      return res.status(403).json({ message: "Can only get message count with friends" });
    }

    const messageCount = await Message.countDocuments({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId },
      ],
    });

    res.status(200).json({ messageCount });
  } catch (error) {
    console.error("Error getting message count:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// New function to delete chat history for both users
export const deleteChatHistory = async (req, res) => {
  try {
    const { id: otherUserId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // Verify friendship
    const areFriends = await validateFriendship(myId, otherUserId);
    if (!areFriends) {
      return res.status(403).json({ 
        message: "Can only delete history with friends" 
      });
    }

    // Delete all messages between these users
    const deletedMessages = await Message.deleteMany({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId },
      ],
    });

    // Emit socket event to both users about chat deletion
    const otherUserSocketId = getReceiverSocketId(otherUserId);
    const mySocketId = getReceiverSocketId(myId);

    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit("chatDeleted", {
        deletedUserId: myId,
        message: "Chat history has been deleted"
      });
    }

    if (mySocketId) {
      io.to(mySocketId).emit("chatDeleted", {
        deletedUserId: otherUserId,
        message: "Chat history has been deleted"
      });
    }

    res.status(200).json({ 
      message: "Chat history deleted successfully",
      deletedCount: deletedMessages.deletedCount
    });
  } catch (error) {
    console.error("Error deleting chat history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const receiverId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ message: "Invalid sender ID format" });
    }

    // Mark all unread messages from sender as read
    const updatedMessages = await Message.updateMany(
      {
        senderId: senderId,
        receiverId: receiverId,
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    // Emit read receipt to sender
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messagesRead", {
        readerId: receiverId,
        readCount: updatedMessages.modifiedCount
      });
    }

    res.status(200).json({ 
      message: "Messages marked as read",
      readCount: updatedMessages.modifiedCount
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get unread message count from a specific user
export const getUnreadMessageCount = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const receiverId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ message: "Invalid sender ID format" });
    }

    const unreadCount = await Message.countDocuments({
      senderId: senderId,
      receiverId: receiverId,
      isRead: false
    });

    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error("Error getting unread message count:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
