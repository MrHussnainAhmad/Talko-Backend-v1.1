import express from "express";
import { 
  login, 
  logout, 
  signup, 
  updateProfile,
  checkAuth,
  verifyEmail,
  resendVerificationEmail,
  deleteAccount
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

//updateProfilePicture
router.put("/update-profile", protectRoute, updateProfile);

//User logged in or not
router.get("/check", protectRoute, checkAuth);

// DELETE ACCOUNT ROUTE - NEW
router.delete("/delete-account", protectRoute, deleteAccount);

export default router;