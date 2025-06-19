import User from "../models/User.model.js";
import Message from "../models/Message.model.js";
import cloudinary from "../lib/cloudinary.js";
import mongoose from "mongoose";
import { getReceiverSocketId, io } from "../lib/socket.js";
import FriendRequest from "../models/FriendRequest.model.js";
import { validateFriendship, removeFriendshipCompletely } from "../lib/RemoveFriend.js";

export const getUsersForSiderbar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    
    // Get friends using the FriendRequest model method
    const friends = await FriendRequest.getFriends(loggedInUserId);
    
    // Add last message info for each friend
    const friendsWithLastMessage = await Promise.all(
      friends.map(async (friend) => {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: friend._id },
            { senderId: friend._id, receiverId: loggedInUserId },
          ],
        }).sort({ createdAt: -1 });

        return {
          ...friend.toObject(),
          lastMessage: lastMessage ? {
            text: lastMessage.text,
            image: lastMessage.image,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId
          } : null
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
    });

    await newMessage.save();

    // Emit real-time message to receiver
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
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