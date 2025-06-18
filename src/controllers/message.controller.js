import User from "../models/User.model.js";
import Message from "../models/Message.model.js";
import cloudinary from "../lib/cloudinary.js";
import mongoose from "mongoose";
import { getReceiverSocketId, io } from "../lib/socket.js";
import FriendRequest from "../models/FriendRequest.model.js";

export const getUsersForSiderbar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const friends = await FriendRequest.getFriends(loggedInUserId);
    res.status(200).json(friends);
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

    const areFriends = await FriendRequest.areFriends(myId, userToChatId);
    if (!areFriends) {
      return res.status(403).json({ message: "Can only message friends" });
    }

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

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

    const areFriends = await FriendRequest.areFriends(senderId, receiverId);
    if (!areFriends) {
      return res.status(403).json({ message: "Can only message friends" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(200).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};