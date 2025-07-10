import express from 'express';
import authRoutes from './routes/auth.route.js';
import friendRoutes from './routes/friend.route.js';
import messageRoutes from './routes/message.route.js';
import dotenv from 'dotenv';
import {connectDB} from './lib/db.js';
import cookieParser from 'cookie-parser';
import cors from "cors"
import  {app, server} from './lib/socket.js';

const PORT = process.env.PORT || 3000;

dotenv.config();

// Increase the limit for JSON payloads to handle base64 images
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

// CORS configuration for production and React Native development
app.use(cors({
  origin: [
    "https://talkora-web-frontend-v1.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173", // Vite development server
    "http://localhost:8081", // React Native development server (web)
    "http://localhost:19006", // Expo web development server (fallback)
    "http://192.168.3.58:3000", // React Native mobile device access
    "http://192.168.3.58:8081" // React Native mobile device access (alt port)
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["set-cookie"]
}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/messages", messageRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to Talkora - Local Development Server!');
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for: https://talkora-web-frontend-v1.vercel.app`);
  console.log(`🔧 Local development CORS enabled for: http://localhost:5173`);
  console.log(`📱 React Native CORS enabled for: http://localhost:8081`);
  console.log(`📱 React Native Mobile CORS enabled for: http://192.168.3.58:${PORT}`);
  connectDB();
});
