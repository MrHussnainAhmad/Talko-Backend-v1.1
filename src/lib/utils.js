// Updated utils.js - Add helper functions for deleted accounts

import jwt from "jsonwebtoken";

export const genToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  const isProduction = process.env.NODE_ENV === "production";
  
  res.cookie("token", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProduction, // Use HTTPS in production
    sameSite: isProduction ? "none" : "lax", // Required for cross-site cookies
    domain: isProduction ? ".railway.app" : "localhost"
  });

  return token;
};

// UPDATED: Handle deleted accounts in user response
export const formatUserResponse = (user) => {
  if (user.isDeleted) {
    return {
      _id: user._id,
      id: user._id,
      fullname: "Talkora xUser",
      username: "",
      email: "",
      profilePic: "",
      friends: [],
      isDeleted: true,
      isOnline: false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  return {
    _id: user._id,
    id: user._id,
    fullname: user.fullname,
    username: user.username,
    email: user.email,
    profilePic: user.profilePic,
    friends: user.friends || [],
    isDeleted: false,
    isOnline: user.isOnline || false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// NEW: Format message response for deleted accounts
export const formatMessageResponse = (message, senderUser = null) => {
  let senderName = message.senderName;
  let senderProfilePic = message.senderProfilePic;

  // If we have sender user data and it's deleted
  if (senderUser && senderUser.isDeleted) {
    senderName = "Talkora xUser";
    senderProfilePic = "";
  }

  return {
    _id: message._id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    message: message.message,
    messageType: message.messageType,
    conversationId: message.conversationId,
    senderName: senderName || "Unknown User",
    senderProfilePic: senderProfilePic || "",
    isDeleted: message.isDeleted || false,
    isSystemMessage: message.isSystemMessage || false,
    isRead: message.isRead || false,
    readAt: message.readAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
};

export const formatFriendRequestResponse = (request) => {
  return {
    _id: request._id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
};

export const handleAsyncError = (asyncFn) => {
  return (req, res, next) => {
    Promise.resolve(asyncFn(req, res, next)).catch(next);
  };
};

export const sendResponse = (res, statusCode, data, message = null) => {
  const response = {
    success: statusCode < 400,
    ...(message && { message }),
    ...(data && { data })
  };
  
  return res.status(statusCode).json(response);
};

export const sendError = (res, statusCode, message, error = null) => {
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && error && { error: error.message })
  };
  
  return res.status(statusCode).json(response);
};

// NEW: Helper to create conversation ID consistently
export const createConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join('-');
};

// NEW: Helper to check if user account is deleted
export const isAccountDeleted = (user) => {
  return user && user.isDeleted === true;
};

// NEW: Helper to get safe user display data
export const getSafeUserDisplayData = (user) => {
  if (!user || user.isDeleted) {
    return {
      fullname: "Talkora xUser",
      username: "",
      profilePic: "",
      isOnline: false,
      isDeleted: true
    };
  }

  return {
    fullname: user.fullname,
    username: user.username,
    profilePic: user.profilePic,
    isOnline: user.isOnline || false,
    isDeleted: false
  };
};