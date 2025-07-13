import express from "express";
import {
  signup,
  login,
  logout,
  updateProfile,
  checkAuth,
  verifyEmail,
  resendVerificationEmail,
  getUserProfile,
  deleteAccount,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getLastSeen,
  checkBlockStatus,
  updateFcmToken,
  removeFcmToken
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

//SignupApi
router.post("/signup", signup);

//LoginApi
router.post("/login", login);

//LogoutApi
router.post("/logout", logout);

//Email Verification
router.get("/verify-email/:token", verifyEmail);

//Resend Verification Email
router.post("/resend-verification", resendVerificationEmail);

//updateProfile - now supports both profilePic and about fields
router.put("/update-profile", protectRoute, updateProfile);

//User logged in or not
router.get("/check", protectRoute, checkAuth);

// NEW: Get user profile by userId
router.get("/user-profile/:userId", protectRoute, getUserProfile);

// DELETE ACCOUNT ROUTE
router.delete("/delete-account", protectRoute, deleteAccount);

// BLOCKING ROUTES
router.post("/block/:userId", protectRoute, blockUser);
router.post("/unblock/:userId", protectRoute, unblockUser);
router.get("/blocked-users", protectRoute, getBlockedUsers);
router.get("/block-status/:userId", protectRoute, checkBlockStatus);

// LAST SEEN ROUTE
router.get("/last-seen/:userId", protectRoute, getLastSeen);

// FCM TOKEN MANAGEMENT ROUTES
router.post("/fcm/update-token", protectRoute, updateFcmToken);
router.post("/fcm/remove-token", protectRoute, removeFcmToken);

export default router;
