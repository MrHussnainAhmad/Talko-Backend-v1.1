import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      console.log('Socket.IO CORS Origin:', origin); // Debug log
      
      // Allow requests with no origin (like mobile apps)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = process.env.NODE_ENV === "production" 
        ? [
            "https://talko-yourprivatechat.netlify.app",
            "https://talko.up.railway.app"
          ] 
        : [
            "http://localhost:5173", 
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174"
          ];
      
      if (allowedOrigins.includes(origin)) {
        console.log('✅ Socket CORS allowed for:', origin);
        callback(null, true);
      } else {
        console.log('❌ Socket CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  // Enhanced Socket.IO configuration for Railway
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6, // 1MB
  allowRequest: (req, callback) => {
    // Additional security check
    const origin = req.headers.origin;
    console.log('Socket allowRequest check for origin:', origin);
    callback(null, true); // Allow all for now, CORS will handle filtering
  }
});

const userSocketMap = {}; // {userId: socketId}

export const getReceiverSocketId = (receiverId) => {
  return userSocketMap[receiverId];
};

io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);
  
  const userId = socket.handshake.query.userId;
  console.log("User ID from handshake:", userId);
  
  if (userId && userId !== "undefined" && userId !== "null") {
    userSocketMap[userId] = socket.id;
    console.log("✅ User mapped:", userId, "->", socket.id);
  } else {
    console.log("⚠️ Invalid userId in handshake:", userId);
  }

  // Emit online users to all connected clients
  const onlineUsers = Object.keys(userSocketMap);
  console.log("📡 Broadcasting online users:", onlineUsers);
  io.emit("getOnlineUsers", onlineUsers);

  socket.on("disconnect", (reason) => {
    console.log("❌ User disconnected:", socket.id, "Reason:", reason);
    
    // Find and remove user from map
    for (const [uid, socketId] of Object.entries(userSocketMap)) {
      if (socketId === socket.id) {
        delete userSocketMap[uid];
        console.log("🗑️ Removed user from map:", uid);
        break;
      }
    }
    
    // Emit updated online users
    const onlineUsers = Object.keys(userSocketMap);
    console.log("📡 Broadcasting updated online users:", onlineUsers);
    io.emit("getOnlineUsers", onlineUsers);
  });

  // Handle connection errors
  socket.on("error", (error) => {
    console.error("❌ Socket error for", socket.id, ":", error);
  });

  // Handle custom events
  socket.on("ping", () => {
    console.log("🏓 Ping received from", socket.id);
    socket.emit("pong");
  });
});

// Handle server-level errors
io.engine.on("connection_error", (err) => {
  console.error("❌ Socket.IO connection error:", err.req, err.code, err.message, err.context);
});

export { io, app, server };