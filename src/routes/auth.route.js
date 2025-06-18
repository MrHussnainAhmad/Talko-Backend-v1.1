import express from "express";
import { login, logout, signup, updateProfile ,checkAuth } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

//SignupApi
router.post("/signup", signup );

//LoginApi
router.post("/login", login );

//LogoutApu
router.post("/logout", logout );

//updateProfilePicture
router.put("/update-profile", protectRoute, updateProfile)

//User logged in or not
router.get("/check", protectRoute, checkAuth)

export default router;
