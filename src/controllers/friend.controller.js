import User from "../models/User.model.js";
import FriendRequest from "../models/FriendRequest.model.js";
import Message from "../models/Message.model.js";
import mongoose from "mongoose";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { removeFriendshipCompletely, getFriendshipStatus } from "../lib/RemoveFriend.js";
import { sendNotification, NotificationTypes } from "../services/notification/notification.handler.js";

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
    const sender = await User.findById(senderId);
    
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if sender is blocked by receiver or receiver is blocked by sender
    if (receiver.isBlocked(senderId) || sender.isBlocked(receiverId)) {
      return res.status(403).json({ message: "Cannot send friend request" });
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

    // Send notification for new friend request
    const notificationTitle = `Friend request from ${sender.fullname}`;
    const notificationBody = message || `You have received a friend request`;

    await sendNotification({
      userId: receiverId,
      type: NotificationTypes.FRIEND_REQUEST,
      title: notificationTitle,
      body: notificationBody,
      data: { senderId: senderId.toString(), requestId: newRequest._id.toString(), senderName: sender.fullname },
      priority: 'normal'
    });

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

    // Send notification for friend request acceptance
    const acceptNotificationTitle = `Friend request accepted`;
    const acceptNotificationBody = `${receiver.fullname} accepted your friend request`;

    await sendNotification({
      userId: request.senderId,
      type: NotificationTypes.FRIEND_REQUEST_ACCEPTED,
      title: acceptNotificationTitle,
      body: acceptNotificationBody,
      data: { friendId: request.receiverId.toString(), friendName: receiver.fullname },
      priority: 'normal'
    });

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

    // Emit friend list update to both users to refresh their friends lists immediately
    io.to(senderSocketId).emit("friendListUpdated", { 
      userId: request.senderId, 
      message: "Friend added" 
    });
    io.to(receiverSocketId).emit("friendListUpdated", { 
      userId: request.receiverId, 
      message: "Friend added" 
    });

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
    const currentUser = await User.findById(userId);
    const friends = await FriendRequest.getFriends(userId);
    
    // Add blocking status and formatted last seen to each friend
    const friendsWithStatus = friends.map(friend => {
      const isBlocked = currentUser.isBlocked(friend._id);
      const isBlockedBy = friend.blockedUsers && friend.blockedUsers.includes(userId);
      
      return {
        ...friend.toObject(),
        isBlocked,
        isBlockedBy,
        formattedLastSeen: !isBlocked && !isBlockedBy ? friend.getFormattedLastSeen() : null,
        // Hide profile info if blocked by friend
        profilePic: isBlockedBy ? "" : friend.profilePic,
        isOnline: isBlockedBy ? false : friend.isOnline,
        lastSeen: isBlockedBy ? null : friend.lastSeen
      };
    });
    
    res.status(200).json(friendsWithStatus);
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

    if (!query) {
      return res.status(400).json({ message: "Search query cannot be empty" });
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
    const friend = await User.findById(friendId).select("fullname username profilePic about lastSeen isOnline blockedUsers");
    const currentUser = await User.findById(userId);
    
    if (!friend) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check blocking status
    const isBlocked = currentUser.isBlocked(friendId);
    const isBlockedBy = friend.isBlocked(userId);
    
    // If blocked by friend, hide profile information
    if (isBlockedBy) {
      return res.status(200).json({
        _id: friend._id,
        fullname: friend.fullname,
        username: "",
        profilePic: "",
        about: "",
        isOnline: false,
        lastSeen: null,
        formattedLastSeen: "Last seen information hidden",
        isBlocked: false,
        isBlockedBy: true
      });
    }

    res.status(200).json({
      ...friend.toObject(),
      formattedLastSeen: friend.getFormattedLastSeen(),
      isBlocked,
      isBlockedBy: false
    });
  } catch (error) {
    console.error("Get friend profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
