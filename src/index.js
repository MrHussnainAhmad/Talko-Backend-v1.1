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

// CORS configuration for production
app.use(cors({
  origin: [
    "https://talko-web-frontend-v1.vercel.app",
    "http://localhost:3000"
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
  res.send('Welcome to Talko - Local Development Server!');
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for: https://talko-web-frontend-v1.vercel.app`);
  connectDB();
});