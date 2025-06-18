import User from "../models/User.model.js";
import FriendRequest from "../models/FriendRequest.model.js";
import mongoose from "mongoose";

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

    const existingRequest = await FriendRequest.requestExists(senderId, receiverId);
    if (existingRequest) {
      return res.status(400).json({ message: "Request already exists" });
    }

    const areFriends = await FriendRequest.areFriends(senderId, receiverId);
    if (areFriends) {
      return res.status(400).json({ message: "Already friends" });
    }

    const newRequest = new FriendRequest({
      senderId,
      receiverId,
      message: message || ""
    });

    await newRequest.save();
    await newRequest.populate("senderId", "fullname username profilePic");

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

    await sender.addFriend(request.receiverId);
    await receiver.addFriend(request.senderId);

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

    request.status = "rejected";
    await request.save();

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

    const friendship = await FriendRequest.findOne({
      $or: [
        { senderId: userId, receiverId: friendId, status: "accepted" },
        { senderId: friendId, receiverId: userId, status: "accepted" }
      ]
    });

    if (!friendship) {
      return res.status(404).json({ message: "Friendship not found" });
    }

    await FriendRequest.deleteOne({ _id: friendship._id });

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    await user.removeFriend(friendId);
    await friend.removeFriend(userId);

    res.status(200).json({ message: "Friend removed successfully" });
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
        const areFriends = await FriendRequest.areFriends(userId, user._id);
        const existingRequest = await FriendRequest.requestExists(userId, user._id);
        
        let status = "none";
        if (areFriends) status = "friends";
        else if (existingRequest) {
          if (existingRequest.senderId.toString() === userId.toString()) {
            status = "sent";
          } else {
            status = "received";
          }
        }

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