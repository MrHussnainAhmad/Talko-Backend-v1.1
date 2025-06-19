import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends,
  removeFriend,
  searchUsers
} from "../controllers/friend.controller.js";

const router = express.Router();

// Friend request management
router.post("/send-request", protectRoute, sendFriendRequest);
router.post("/accept/:requestId", protectRoute, acceptFriendRequest);
router.post("/reject/:requestId", protectRoute, rejectFriendRequest);
router.delete("/cancel/:requestId", protectRoute, cancelFriendRequest);

// Get friend requests
router.get("/requests/incoming", protectRoute, getIncomingRequests);
router.get("/requests/outgoing", protectRoute, getOutgoingRequests);

// Friends management
router.get("/", protectRoute, getFriends);
router.delete("/remove/:friendId", protectRoute, removeFriend);

// User search
router.get("/search", protectRoute, searchUsers);

export default router;