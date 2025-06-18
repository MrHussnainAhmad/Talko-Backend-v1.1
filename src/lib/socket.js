import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
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

  // Send list of online users to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle friend request events
  socket.on("friendRequestSent", (data) => {
    const receiverSocketId = getReceiverSocketId(data.receiverId);
    if (receiverSocketId) {
      console.log(`Sending friend request notification to user ${data.receiverId}`);
      io.to(receiverSocketId).emit("newFriendRequest", {
        request: data.request,
        message: "You have a new friend request"
      });
    }
  });

  // Handle friend request acceptance
  socket.on("friendRequestAccepted", (data) => {
    const senderSocketId = getReceiverSocketId(data.senderId);
    if (senderSocketId) {
      console.log(`Notifying user ${data.senderId} that their friend request was accepted`);
      io.to(senderSocketId).emit("friendRequestAccepted", {
        friendId: data.friendId,
        message: `${data.accepterName} accepted your friend request`
      });
    }
  });

  // Handle friend request rejection
  socket.on("friendRequestRejected", (data) => {
    const senderSocketId = getReceiverSocketId(data.senderId);
    if (senderSocketId) {
      console.log(`Notifying user ${data.senderId} that their friend request was rejected`);
      io.to(senderSocketId).emit("friendRequestRejected", {
        friendId: data.friendId,
        message: `Your friend request was declined`
      });
    }
  });

  // Handle friend removal
  socket.on("friendRemoved", (data) => {
    const friendSocketId = getReceiverSocketId(data.friendId);
    if (friendSocketId) {
      console.log(`Notifying user ${data.friendId} that they were removed as a friend`);
      io.to(friendSocketId).emit("friendRemoved", {
        userId: data.userId,
        message: "A friend has removed you from their friend list"
      });
    }
  });

  // Handle typing indicators for messages
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

  // Handle user going online/offline status updates
  socket.on("userOnline", (userId) => {
    if (userId && userId !== "undefined") {
      userSocketMap[userId] = socket.id;
      console.log(`User ${userId} is now online`);
      // Broadcast to all users that this user is online
      socket.broadcast.emit("userStatusUpdate", {
        userId: userId,
        isOnline: true
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
    
    // Find and remove the user from the socket map
    const disconnectedUserId = Object.keys(userSocketMap).find(
      key => userSocketMap[key] === socket.id
    );
    
    if (disconnectedUserId) {
      delete userSocketMap[disconnectedUserId];
      console.log(`User ${disconnectedUserId} went offline`);
      
      // Broadcast to all users that this user is offline
      socket.broadcast.emit("userStatusUpdate", {
        userId: disconnectedUserId,
        isOnline: false
      });
    }
    
    // Send updated online users list
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

export { io, app, server };