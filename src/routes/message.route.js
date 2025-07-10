import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUsersForSiderbar,
  getMessages,
  sendMessage,
  deleteMessagesWithUser,
  getMessageCount,
  deleteChatHistory,
  markMessagesAsRead,
  getUnreadMessageCount
} from "../controllers/message.controller.js";

const router = express.Router();

// Get friends for sidebar with last message info
router.get("/users", protectRoute, getUsersForSiderbar);

// Get messages with a specific user
router.get("/:id", protectRoute, getMessages);

// Send a message to a specific user
router.post("/send/:id", protectRoute, sendMessage);

// Delete all messages with a specific user (used when unfriending)
router.delete("/delete/:id", protectRoute, deleteMessagesWithUser);

// Get message count with a specific user
router.get("/count/:id", protectRoute, getMessageCount);

// Delete chat history for both users
router.delete("/privacy/:id", protectRoute, deleteChatHistory);

// Mark messages as read
router.put("/read/:id", protectRoute, markMessagesAsRead);

// Get unread message count from a specific user
router.get("/unread/:id", protectRoute, getUnreadMessageCount);

export default router;
