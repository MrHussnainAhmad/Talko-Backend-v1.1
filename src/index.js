import express from 'express';
import authRoutes from './routes/auth.route.js';
import dotenv from 'dotenv';
import {connectDB} from './lib/db.js';
import cookieParser from 'cookie-parser';
import messageRoutes from './routes/message.route.js';
import friendRoutes from './routes/friend.route.js';
import cors from "cors"
import  {app, server} from './lib/socket.js';

const PORT = process.env.PORT || 3000;

dotenv.config();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/friends", friendRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to Talko!');
});

server.listen(PORT, () => {
  console.log('Server is running on port:' + PORT);
  connectDB();
});