// Updated socket.js - Add account deletion handling

import { Server } from "socket.io";
import http from "http";
import express from "express";
import User from "../models/User.model.js";
import { connectDB } from "./db.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://talkora-web-frontend-v1.vercel.app",
      "exp://192.168.3.58:8081", // Expo development
      "http://localhost:8081", // Local development
      "http://192.168.3.58:8081", // Local network
      /^exp:\/\//,  // Allow all expo URLs
      /^http:\/\/192\.168\./,  // Allow local network IPs
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowEIO3: true, // Allow Engine.IO v3 clients
  },
  allowEIO3: true, // Allow Engine.IO v3 clients
  transports: ['polling', 'websocket'],
});

const userSocketMap = {}; // {userId: socketId}

// Function to get current online users
const getOnlineUsers = () => {
  return Object.keys(userSocketMap);
};

// Function to broadcast online users to all clients
const broadcastOnlineUsers = () => {
  const onlineUsers = getOnlineUsers();
  io.emit("getOnlineUsers", onlineUsers);
  console.log(`📡 Broadcasting online users to all clients: [${onlineUsers.join(', ')}]`);
};

// Periodic sync every 5 seconds to ensure consistency
setInterval(() => {
  if (Object.keys(userSocketMap).length > 0) {
    broadcastOnlineUsers();
    console.log('🔄 Periodic online users sync');
  }
}, 5000); // 5 seconds

export const getReceiverSocketId = (receiverId) => {
  return userSocketMap[receiverId];
};

io.on("connection", async (socket) => {
  console.log("A user connected: " + socket.id);
  
  const userId = socket.handshake.query.userId;
  if (userId && userId !== "undefined") {
    // Add user to the socket map
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} connected with socket ${socket.id}`);
    
    // Update user's online status in database
    try {
      await connectDB();
      await User.findByIdAndUpdate(userId, { 
        isOnline: true, 
        lastSeen: new Date() 
      });
      console.log(`✅ User ${userId} online status updated in database`);
    } catch (error) {
      console.error(`❌ Failed to update online status for user ${userId}:`, error.message);
    }
    
    // Immediately send current online users to the new user
    const currentOnlineUsers = getOnlineUsers();
    socket.emit("getOnlineUsers", currentOnlineUsers);
    console.log(`📤 Sent current online users to ${userId}: [${currentOnlineUsers.join(', ')}]`);
    
    // Broadcast updated online users list to ALL users (including the new one)
    broadcastOnlineUsers();
  }

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

      // Broadcast friend list update to all users
      io.emit("friendListUpdated", { userId, message: "Friend list updated" });
    }
  });

  // Trigger profile updates
  socket.on("profileChanged", (data) => {
    const { userId, updatedProfile } = data;
    // Emit profile updated event to all users
    io.emit("profileUpdated", { userId, updatedProfile });
  });

  // Manual sync request
  socket.on("requestOnlineUsers", (userId) => {
    if (userId && userId !== "undefined") {
      const currentOnlineUsers = getOnlineUsers();
      socket.emit("getOnlineUsers", currentOnlineUsers);
      console.log(`📤 Manual sync: Sent online users to ${userId}: [${currentOnlineUsers.join(', ')}]`);
    }
  });

  // sendMessage socket event removed - messages are sent via API
  // The API controller handles saving to DB and emitting via Socket.IO

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
          displayName: "Talkora xUser"
        });
      }
    });
    
    // Update online users list
    broadcastOnlineUsers();
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected: " + socket.id);
    
    const disconnectedUserId = Object.keys(userSocketMap).find(
      key => userSocketMap[key] === socket.id
    );
    
    if (disconnectedUserId) {
      // Remove user from socket map
      delete userSocketMap[disconnectedUserId];
      console.log(`User ${disconnectedUserId} went offline`);
      
      // Update user's offline status and lastSeen in database
      try {
        await connectDB();
        await User.findByIdAndUpdate(disconnectedUserId, { 
          isOnline: false, 
          lastSeen: new Date() 
        });
        console.log(`✅ User ${disconnectedUserId} offline status updated in database`);
      } catch (error) {
        console.error(`❌ Failed to update offline status for user ${disconnectedUserId}:`, error.message);
      }
      
      // Broadcast updated online users list to ALL remaining users
      broadcastOnlineUsers();
      
      // Also emit user status update
      socket.broadcast.emit("userStatusUpdate", {
        userId: disconnectedUserId,
        isOnline: false
      });
      
      console.log(`User ${disconnectedUserId} disconnected, broadcasting to all clients`);
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

export { io, app, server };