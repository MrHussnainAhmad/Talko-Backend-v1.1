import User from "../models/User.model.js";
import Message from "../models/Message.model.js";
import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendNotification, NotificationTypes } from "../services/notification/notification.handler.js";

// Mark message as read from notification
export const markMessageAsRead = async (req, res) => {
  try {
    console.log("📖 Mark message as read from notification for user:", req.user._id);
    
    const { messageId, conversationId } = req.body;
    const userId = req.user._id;
    
    if (!messageId || !conversationId) {
      return res.status(400).json({
        message: "Message ID and conversation ID are required"
      });
    }
    
    await connectDB();
    
    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    // Check if user is the receiver
    if (message.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized to mark this message as read" });
    }
    
    // Mark message as read if not already read
    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
      
      // Emit read receipt to sender
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit('messageRead', {
          messageId: message._id,
          conversationId: message.conversationId,
          readAt: message.readAt,
          readBy: userId
        });
      }
      
      console.log("✅ Message marked as read from notification");
      
      res.status(200).json({
        message: "Message marked as read successfully",
        messageId: message._id,
        readAt: message.readAt
      });
    } else {
      res.status(200).json({
        message: "Message already marked as read",
        messageId: message._id,
        readAt: message.readAt
      });
    }
    
  } catch (error) {
    console.error("❌ Mark message as read error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Reply to message from notification
export const replyFromNotification = async (req, res) => {
  try {
    console.log("💬 Reply from notification for user:", req.user._id);
    
    const { originalMessageId, replyText, conversationId } = req.body;
    const senderId = req.user._id;
    
    if (!originalMessageId || !replyText || !conversationId) {
      return res.status(400).json({
        message: "Original message ID, reply text, and conversation ID are required"
      });
    }
    
    await connectDB();
    
    // Find the original message to get receiver info
    const originalMessage = await Message.findById(originalMessageId);
    if (!originalMessage) {
      return res.status(404).json({ message: "Original message not found" });
    }
    
    // Determine receiver ID (the sender of the original message)
    const receiverId = originalMessage.senderId;
    
    // Get sender info
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }
    
    // Check if receiver exists and is not blocked
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }
    
    // Check if users have blocked each other
    if (sender.isBlocked(receiverId) || receiver.isBlocked(senderId)) {
      return res.status(403).json({ 
        message: "Cannot send message due to blocking restrictions" 
      });
    }
    
    // Create the reply message
    const replyMessage = new Message({
      senderId,
      receiverId,
      message: replyText,
      messageType: "text",
      conversationId,
      senderName: sender.fullname,
      senderProfilePic: sender.profilePic || "",
      isRead: false,
      replyTo: originalMessageId // Reference to original message
    });
    
    await replyMessage.save();
    
    // Emit the message to receiver if online
    const receiverSocketId = getReceiverSocketId(receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('newMessage', {
        message: replyMessage,
        isReply: true,
        originalMessageId
      });
      console.log("✅ Reply sent via socket to receiver");
    }
    
    // Emit to sender for confirmation
    const senderSocketId = getReceiverSocketId(senderId.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit('messageSent', {
        message: replyMessage,
        isReply: true,
        originalMessageId
      });
    }
    
    // Send push notification if receiver is offline
    if (!receiverSocketId) {
      await sendNotification({
        userId: receiverId,
        type: NotificationTypes.NEW_MESSAGE,
        title: `${sender.fullname}`,
        body: replyText,
        data: {
          senderId: senderId.toString(),
          senderName: sender.fullname,
          senderProfilePic: sender.profilePic || "",
          messageId: replyMessage._id.toString(),
          conversationId,
          isReply: true,
          originalMessageId: originalMessageId.toString()
        },
        priority: 'high'
      });
    }
    
    console.log("✅ Reply from notification sent successfully");
    
    res.status(201).json({
      message: "Reply sent successfully",
      replyMessage: {
        _id: replyMessage._id,
        senderId: replyMessage.senderId,
        receiverId: replyMessage.receiverId,
        message: replyMessage.message,
        messageType: replyMessage.messageType,
        conversationId: replyMessage.conversationId,
        senderName: replyMessage.senderName,
        senderProfilePic: replyMessage.senderProfilePic,
        isRead: replyMessage.isRead,
        replyTo: replyMessage.replyTo,
        createdAt: replyMessage.createdAt
      }
    });
    
  } catch (error) {
    console.error("❌ Reply from notification error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get unread notifications count
export const getUnreadNotificationsCount = async (req, res) => {
  try {
    console.log("🔢 Get unread notifications count for user:", req.user._id);
    
    const userId = req.user._id;
    await connectDB();
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const unreadCount = user.unreadNotifications ? user.unreadNotifications.filter(n => !n.read).length : 0;
    
    res.status(200).json({
      unreadCount,
      message: "Unread notifications count retrieved successfully"
    });
    
  } catch (error) {
    console.error("❌ Get unread notifications count error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all notifications for user
export const getUserNotifications = async (req, res) => {
  try {
    console.log("📋 Get user notifications for user:", req.user._id);
    
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    
    await connectDB();
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Sort notifications by creation date (newest first) and paginate
    const notifications = user.unreadNotifications || [];
    const sortedNotifications = notifications
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);
    
    res.status(200).json({
      notifications: sortedNotifications,
      totalCount: notifications.length,
      unreadCount: notifications.filter(n => !n.read).length,
      page: parseInt(page),
      limit: parseInt(limit),
      message: "User notifications retrieved successfully"
    });
    
  } catch (error) {
    console.error("❌ Get user notifications error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    console.log("📖 Mark notification as read for user:", req.user._id);
    
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    if (!notificationId) {
      return res.status(400).json({
        message: "Notification ID is required"
      });
    }
    
    await connectDB();
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Find and mark the specific notification as read
    const notification = user.unreadNotifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    notification.read = true;
    await user.save();
    
    console.log("✅ Notification marked as read");
    
    res.status(200).json({
      message: "Notification marked as read successfully",
      notificationId
    });
    
  } catch (error) {
    console.error("❌ Mark notification as read error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Clear all notifications
export const clearAllNotifications = async (req, res) => {
  try {
    console.log("🧹 Clear all notifications for user:", req.user._id);
    
    const userId = req.user._id;
    await connectDB();
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    user.unreadNotifications = [];
    await user.save();
    
    console.log("✅ All notifications cleared");
    
    res.status(200).json({
      message: "All notifications cleared successfully"
    });
    
  } catch (error) {
    console.error("❌ Clear all notifications error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
