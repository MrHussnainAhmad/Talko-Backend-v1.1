// Updated socket.js - Add account deletion handling

import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://talko-web-frontend-v1.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const userSocketMap = {}; // {userId: socketId}

export const getReceiverSocketId = (receiverId) => {
  return userSocketMap[receiverId];
};

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);
  
  const userId = socket.handshake.query.userId;
  if (userId && userId !== "undefined") {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} connected with socket ${socket.id}`);
  }

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("typing", (data) => {
    const receiverSocketId = getReceiverSocketId(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userTyping", {
        senderId: data.senderId,
        senderName: data.senderName
      });
    }
  });

  socket.on("stopTyping", (data) => {
    const receiverSocketId = getReceiverSocketId(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userStoppedTyping", {
        senderId: data.senderId
      });
    }
  });

  socket.on("userOnline", (userId) => {
    if (userId && userId !== "undefined") {
      userSocketMap[userId] = socket.id;
      console.log(`User ${userId} is now online`);
      socket.broadcast.emit("userStatusUpdate", {
        userId: userId,
        isOnline: true
      });
    }
  });

  socket.on("refreshFriendsList", (userId) => {
    if (userId && userId !== "undefined") {
      const userSocketId = getReceiverSocketId(userId);
      if (userSocketId) {
        io.to(userSocketId).emit("refreshFriendsList", {
          message: "Please refresh your friends list"
        });
      }
    }
  });

  socket.on("sendMessage", (data) => {
    const receiverSocketId = getReceiverSocketId(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", data.message);
    }
  });

  // NEW: Handle account deletion notification
  socket.on("accountDeleted", (data) => {
    const { deletedUserId, affectedUserIds } = data;
    
    // Remove deleted user from online users
    if (userSocketMap[deletedUserId]) {
      delete userSocketMap[deletedUserId];
    }
    
    // Notify all affected users (friends of the deleted user)
    affectedUserIds.forEach(userId => {
      const userSocketId = getReceiverSocketId(userId);
      if (userSocketId) {
        io.to(userSocketId).emit("userAccountDeleted", {
          deletedUserId: deletedUserId,
          message: "A user has deleted their account",
          displayName: "Talko User"
        });
      }
    });
    
    // Update online users list
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
    
    const disconnectedUserId = Object.keys(userSocketMap).find(
      key => userSocketMap[key] === socket.id
    );
    
    if (disconnectedUserId) {
      delete userSocketMap[disconnectedUserId];
      console.log(`User ${disconnectedUserId} went offline`);
      
      socket.broadcast.emit("userStatusUpdate", {
        userId: disconnectedUserId,
        isOnline: false
      });
    }
    
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

export { io, app, server };