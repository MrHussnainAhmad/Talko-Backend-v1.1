import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends,
  removeFriend,
  searchUsers
} from "../controllers/friend.controller.js";

const router = express.Router();

router.post("/send-request", protectRoute, sendFriendRequest);
router.post("/accept/:requestId", protectRoute, acceptFriendRequest);
router.post("/reject/:requestId", protectRoute, rejectFriendRequest);
router.get("/requests/incoming", protectRoute, getIncomingRequests);
router.get("/requests/outgoing", protectRoute, getOutgoingRequests);
router.get("/", protectRoute, getFriends);
router.delete("/remove/:friendId", protectRoute, removeFriend);
router.get("/search", protectRoute, searchUsers);

export default router;