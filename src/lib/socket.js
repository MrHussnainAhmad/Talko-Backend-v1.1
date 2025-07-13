// Updated socket.js - Add real-time blocking/unblocking system

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
      "http://localhost:5173",
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

// Support multiple connections per user (web + mobile)
const userSocketMap = {}; // {userId: [socketId1, socketId2, ...]}
const socketUserMap = {}; // {socketId: userId} for quick reverse lookup

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
  return userSocketMap[receiverId] || [];
};

// Helper function to emit to all sockets of a user
const emitToAllUserSockets = (userId, event, data) => {
  const socketIds = getReceiverSocketId(userId);
  if (socketIds && socketIds.length > 0) {
    socketIds.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
    console.log(`📤 Emitted '${event}' to all ${socketIds.length} sockets of user ${userId}`);
    return true;
  }
  return false;
};

io.on("connection", async (socket) => {
  console.log("A user connected: " + socket.id);
  
  const userId = socket.handshake.query.userId;
  if (userId && userId !== "undefined") {
    // Add reverse mapping
    socketUserMap[socket.id] = userId;
    
    // Initialize user's socket array if not exists
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = [];
    }
    
    // Add socket to user's socket array if not already present
    if (!userSocketMap[userId].includes(socket.id)) {
      userSocketMap[userId].push(socket.id);
      console.log(`User ${userId} connected with socket ${socket.id}. Active sockets: [${userSocketMap[userId].join(', ')}]`);
    }
    
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
    emitToAllUserSockets(data.receiverId, "userTyping", {
      senderId: data.senderId,
      senderName: data.senderName
    });
  });

  socket.on("stopTyping", (data) => {
    emitToAllUserSockets(data.receiverId, "userStoppedTyping", {
      senderId: data.senderId
    });
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

  // NEW: Real-time blocking system
  socket.on("userBlocked", (data) => {
    const { blockerId, blockedUserId, blockerName } = data;
    
    console.log(`🚫 User ${blockerId} blocked ${blockedUserId}`);
    
    // Notify the blocked user immediately
    const blockedUserSocketId = getReceiverSocketId(blockedUserId);
    if (blockedUserSocketId) {
      io.to(blockedUserSocketId).emit("youWereBlocked", {
        blockerId: blockerId,
        blockerName: blockerName || "Someone",
        timestamp: new Date()
      });
      console.log(`📤 Notified ${blockedUserId} that they were blocked by ${blockerId}`);
    }
    
    // Notify the blocker to update their UI
    const blockerSocketId = getReceiverSocketId(blockerId);
    if (blockerSocketId) {
      io.to(blockerSocketId).emit("blockActionConfirmed", {
        action: "blocked",
        targetUserId: blockedUserId,
        timestamp: new Date()
      });
      console.log(`📤 Confirmed block action to ${blockerId}`);
    }
    
    // Optimized: Only refresh friends' contact lists instead of all users
    // This is handled by the auth controller's refreshFriendsContactLists function
    console.log("📝 Block event handled - contact refresh managed by auth controller");
  });

  socket.on("userUnblocked", (data) => {
    const { unblockerId, unblockedUserId, unblockerName } = data;
    
    console.log(`✅ User ${unblockerId} unblocked ${unblockedUserId}`);
    
    // Notify the unblocked user immediately
    const unblockedUserSocketId = getReceiverSocketId(unblockedUserId);
    if (unblockedUserSocketId) {
      io.to(unblockedUserSocketId).emit("youWereUnblocked", {
        unblockerId: unblockerId,
        unblockerName: unblockerName || "Someone",
        timestamp: new Date()
      });
      console.log(`📤 Notified ${unblockedUserId} that they were unblocked by ${unblockerId}`);
    }
    
    // Notify the unblocker to update their UI
    const unblockerSocketId = getReceiverSocketId(unblockerId);
    if (unblockerSocketId) {
      io.to(unblockerSocketId).emit("blockActionConfirmed", {
        action: "unblocked",
        targetUserId: unblockedUserId,
        timestamp: new Date()
      });
      console.log(`📤 Confirmed unblock action to ${unblockerId}`);
    }
    
    // Optimized: Only refresh friends' contact lists instead of all users
    // This is handled by the auth controller's refreshFriendsContactLists function
    console.log("📝 Unblock event handled - contact refresh managed by auth controller");
  });

  // Handle blocking status check requests
  socket.on("checkBlockStatus", (data) => {
    const { requesterId, targetUserId } = data;
    
    // This would typically involve a database query
    // For now, just acknowledge the request
    const requesterSocketId = getReceiverSocketId(requesterId);
    if (requesterSocketId) {
      io.to(requesterSocketId).emit("blockStatusChecked", {
        targetUserId: targetUserId,
        timestamp: new Date()
      });
    }
  });

  // sendMessage socket event removed - messages are sent via API
  // The API controller handles saving to DB and emitting via Socket.IO

  // Handle account deletion notification
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
    
    // Get the userId from the reverse mapping
    const disconnectedUserId = socketUserMap[socket.id];
    
    if (disconnectedUserId) {
      // Remove the socket from the user's socket array
      if (userSocketMap[disconnectedUserId]) {
        userSocketMap[disconnectedUserId] = userSocketMap[disconnectedUserId].filter(
          socketId => socketId !== socket.id
        );
        
        console.log(`Socket ${socket.id} removed from user ${disconnectedUserId}. Remaining sockets: [${userSocketMap[disconnectedUserId].join(', ')}]`);
        
        // Only mark user as offline if they have no more active sockets
        if (userSocketMap[disconnectedUserId].length === 0) {
          delete userSocketMap[disconnectedUserId];
          console.log(`User ${disconnectedUserId} went offline - no more active sockets`);
          
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
        } else {
          console.log(`User ${disconnectedUserId} still has ${userSocketMap[disconnectedUserId].length} active socket(s), keeping online`);
        }
      }
      
      // Remove from reverse mapping
      delete socketUserMap[socket.id];
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

export { io, app, server };