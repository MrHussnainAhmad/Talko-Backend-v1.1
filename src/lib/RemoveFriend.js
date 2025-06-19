import Message from "../models/Message.model.js";
import FriendRequest from "../models/FriendRequest.model.js";
import User from "../models/User.model.js";
import { io, getReceiverSocketId } from "./socket.js";

/**
 * Utility function to completely remove friendship and associated data
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Object>} - Result object with success status and message
 */
export const removeFriendshipCompletely = async (userId1, userId2) => {
  try {
    // Find and delete the friendship record
    const friendship = await FriendRequest.findOneAndDelete({
      $or: [
        { senderId: userId1, receiverId: userId2, status: "accepted" },
        { senderId: userId2, receiverId: userId1, status: "accepted" }
      ]
    });

    if (!friendship) {
      return {
        success: false,
        message: "Friendship not found"
      };
    }

    // Remove friend from both users' friends arrays
    await Promise.all([
      User.findByIdAndUpdate(userId1, { $pull: { friends: userId2 } }),
      User.findByIdAndUpdate(userId2, { $pull: { friends: userId1 } })
    ]);

    // Delete all messages between these users
    const deletedMessages = await Message.deleteMany({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ]
    });

    // Emit socket events for real-time updates
    const user1SocketId = getReceiverSocketId(userId1);
    const user2SocketId = getReceiverSocketId(userId2);

    if (user1SocketId) {
      io.to(user1SocketId).emit("friendshipEnded", {
        friendId: userId2,
        messagesDeleted: deletedMessages.deletedCount,
        message: "Friendship ended, chat history cleared"
      });
    }

    if (user2SocketId) {
      io.to(user2SocketId).emit("friendshipEnded", {
        friendId: userId1,
        messagesDeleted: deletedMessages.deletedCount,
        message: "A friend has removed you, chat history cleared"
      });
    }

    return {
      success: true,
      message: "Friendship removed successfully",
      deletedMessages: deletedMessages.deletedCount
    };

  } catch (error) {
    console.error("Error removing friendship:", error);
    return {
      success: false,
      message: "Failed to remove friendship",
      error: error.message
    };
  }
};

/**
 * Utility function to clean up rejected friend requests (maintenance)
 * This can be called periodically to clean up old rejected requests
 * @returns {Promise<Object>} - Result object with cleanup statistics
 */
export const cleanupRejectedRequests = async () => {
  try {
    const result = await FriendRequest.deleteMany({ status: "rejected" });
    
    return {
      success: true,
      message: `Cleaned up ${result.deletedCount} rejected requests`,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error("Error cleaning up rejected requests:", error);
    return {
      success: false,
      message: "Failed to cleanup rejected requests",
      error: error.message
    };
  }
};

/**
 * Utility function to validate friendship before allowing message operations
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<boolean>} - True if users are friends, false otherwise
 */
export const validateFriendship = async (userId1, userId2) => {
  try {
    const areFriends = await FriendRequest.areFriends(userId1, userId2);
    return areFriends;
  } catch (error) {
    console.error("Error validating friendship:", error);
    return false;
  }
};

/**
 * Utility function to get friendship status between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<string>} - Status: 'friends', 'sent', 'received', or 'none'
 */
export const getFriendshipStatus = async (userId1, userId2) => {
  try {
    // Check if they are friends
    const areFriends = await FriendRequest.areFriends(userId1, userId2);
    if (areFriends) {
      return 'friends';
    }

    // Check for pending requests
    const pendingRequest = await FriendRequest.findOne({
      $or: [
        { senderId: userId1, receiverId: userId2, status: "pending" },
        { senderId: userId2, receiverId: userId1, status: "pending" }
      ]
    });

    if (pendingRequest) {
      if (pendingRequest.senderId.toString() === userId1.toString()) {
        return 'sent';
      } else {
        return 'received';
      }
    }

    return 'none';
  } catch (error) {
    console.error("Error getting friendship status:", error);
    return 'none';
  }
};

/**
 * Utility function to safely delete a friend request
 * @param {string} requestId - Friend request ID
 * @param {string} userId - User ID making the request
 * @returns {Promise<Object>} - Result object
 */
export const safeDeleteFriendRequest = async (requestId, userId) => {
  try {
    const request = await FriendRequest.findById(requestId);
    
    if (!request) {
      return {
        success: false,
        message: "Friend request not found"
      };
    }

    // Verify the user has permission to delete this request
    if (request.receiverId.toString() !== userId.toString() && 
        request.senderId.toString() !== userId.toString()) {
      return {
        success: false,
        message: "Not authorized to delete this request"
      };
    }

    await FriendRequest.deleteOne({ _id: requestId });

    return {
      success: true,
      message: "Friend request deleted successfully"
    };
  } catch (error) {
    console.error("Error deleting friend request:", error);
    return {
      success: false,
      message: "Failed to delete friend request",
      error: error.message
    };
  }
};