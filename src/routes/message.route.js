import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUsersForSiderbar,
  getMessages,
  sendMessage,
} from "../controllers/message.controller.js";

const router = express.Router();

// Fixed: Changed "/user" to "/users" to match the frontend call
router.get("/users", protectRoute, getUsersForSiderbar);

router.get("/:id", protectRoute, getMessages);

// Fixed: Added missing "/" in the route
router.post("/send/:id", protectRoute, sendMessage);

export default router;