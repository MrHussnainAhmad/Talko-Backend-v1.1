import User from "../models/User.model.js";
import FriendRequest from "../models/FriendRequest.model.js";
import Message from "../models/Message.model.js";
import mongoose from "mongoose";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { removeFriendshipCompletely, getFriendshipStatus } from "../lib/RemoveFriend.js";

export const sendFriendRequest = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver ID" });
    }

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "Cannot send request to yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if they are already friends
    const areFriends = await FriendRequest.areFriends(senderId, receiverId);
    if (areFriends) {
      return res.status(400).json({ message: "Already friends" });
    }

    // Check for existing pending requests
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId: senderId, receiverId: receiverId, status: "pending" },
        { senderId: receiverId, receiverId: senderId, status: "pending" },
      ],
    });

    if (existingRequest) {
      return res.status(400).json({ message: "Request already exists" });
    }

    const newRequest = new FriendRequest({
      senderId,
      receiverId,
      message: message || "",
      status: "pending"
    });

    await newRequest.save();
    await newRequest.populate("senderId", "fullname username profilePic");

    // Emit socket event for real-time notification
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newFriendRequest", {
        request: newRequest,
        message: "You have a new friend request"
      });
    }

    console.log(`✅ Friend request sent from ${req.user.fullname} to ${receiver.fullname}`);
    res.status(201).json({ message: "Friend request sent", request: newRequest });
  } catch (error) {
    console.error("Send friend request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Invalid request ID" });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    request.status = "accepted";
    await request.save();

    const sender = await User.findById(request.senderId);
    const receiver = await User.findById(request.receiverId);

    // Add each other as friends
    await sender.addFriend(request.receiverId);
    await receiver.addFriend(request.senderId);

    // Emit socket event for real-time notification
    const senderSocketId = getReceiverSocketId(request.senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestAccepted", {
        friendId: request.receiverId,
        message: `${receiver.fullname} accepted your friend request`,
        friend: {
          _id: receiver._id,
          fullname: receiver.fullname,
          username: receiver.username,
          profilePic: receiver.profilePic
        }
      });
    }

    // Also notify the receiver to update their UI
    const receiverSocketId = getReceiverSocketId(request.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequestProcessed", {
        requestId: requestId,
        action: "accepted",
        message: "Friend request accepted"
      });
    }

    console.log(`✅ Friend request accepted: ${receiver.fullname} accepted ${sender.fullname}`);
    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.error("Accept friend request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const rejectFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Invalid request ID" });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    // Delete the request entirely so user can send again later
    await FriendRequest.deleteOne({ _id: request._id });

    // Emit socket event for real-time notification
    const senderSocketId = getReceiverSocketId(request.senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestRejected", {
        friendId: request.receiverId,
        message: "Your friend request was declined"
      });
    }

    // Also notify the receiver to update their UI
    const receiverSocketId = getReceiverSocketId(request.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequestProcessed", {
        requestId: requestId,
        action: "rejected",
        message: "Friend request rejected"
      });
    }

    console.log(`❌ Friend request rejected: ${req.user.fullname} rejected request`);
    res.status(200).json({ message: "Friend request rejected" });
  } catch (error) {
    console.error("Reject friend request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getIncomingRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({
      receiverId: userId,
      status: "pending"
    }).populate("senderId", "fullname username profilePic").sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Get incoming requests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getOutgoingRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({
      senderId: userId,
      status: "pending"
    }).populate("receiverId", "fullname username profilePic").sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Get outgoing requests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getFriends = async (req, res) => {
  try {
    const userId = req.user._id;
    const friends = await FriendRequest.getFriends(userId);
    res.status(200).json(friends);
  } catch (error) {
    console.error("Get friends error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: "Invalid friend ID" });
    }

    // Use the utility function to completely remove friendship
    const result = await removeFriendshipCompletely(userId, friendId);

    if (!result.success) {
      return res.status(404).json({ message: result.message });
    }

    console.log(`🗑️ Friendship removed: ${req.user.fullname} removed friend ${friendId}`);
    console.log(`📝 Deleted ${result.deletedMessages} messages`);

    res.status(200).json({ 
      message: result.message,
      deletedMessages: result.deletedMessages
    });
  } catch (error) {
    console.error("Remove friend error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const users = await User.find({
      _id: { $ne: userId },
      $or: [
        { fullname: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ]
    }).select("fullname username email profilePic").limit(20);

    const usersWithStatus = await Promise.all(
      users.map(async (user) => {
        const status = await getFriendshipStatus(userId, user._id);
        
        return {
          ...user.toObject(),
          relationshipStatus: status
        };
      })
    );

    res.status(200).json(usersWithStatus);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// New function to cancel outgoing friend request
export const cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Invalid request ID" });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized to cancel this request" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already processed" });
    }

    await FriendRequest.deleteOne({ _id: request._id });

    // Notify the receiver that the request was cancelled
    const receiverSocketId = getReceiverSocketId(request.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequestCancelled", {
        requestId: requestId,
        senderId: userId,
        message: "A friend request was cancelled"
      });
    }

    console.log(`❌ Friend request cancelled by ${req.user.fullname}`);
    res.status(200).json({ message: "Friend request cancelled" });
  } catch (error) {
    console.error("Cancel friend request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get friend's profile - only accessible if users are friends
export const getFriendProfile = async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: "Invalid friend ID" });
    }

    // Check if they are friends
    const areFriends = await FriendRequest.areFriends(userId, friendId);
    if (!areFriends) {
      return res.status(403).json({ message: "You can only view profiles of your friends" });
    }

    // Get the friend's profile
    const friend = await User.findById(friendId).select("fullname username profilePic about lastSeen");
    if (!friend) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(friend);
  } catch (error) {
    console.error("Get friend profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
