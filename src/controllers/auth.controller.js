import User from "../models/User.model.js";
import Message from "../models/Message.model.js";
import FriendRequest from "../models/FriendRequest.model.js";
import mongoose from "mongoose"; // FIXED: Added mongoose import
import bcrypt from "bcryptjs";
import { genToken } from "../lib/utils.js";
import cloudinary from "../lib/cloudinary.js";
import { connectDB } from "../lib/db.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import eMailToken from "../models/Token.js";
import sendEmail from "../lib/sendEmail.js";
import crypto from "crypto";

//signup controller
export const signup = async (req, res) => {
  const { fullname, username, email, password } = req.body;
  let newUser, emailToken;

  try {
    console.log("🔐 Signup attempt for:", email);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for signup");

    // Validate input
    if (!fullname || !username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    //Checking Password Length
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    //Checking Email with timeout
    const user = await Promise.race([
      User.findOne({ email }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 10000)
      ),
    ]);

    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    console.log("✅ Email is available");

    //Hashing Pass
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);

    newUser = new User({
      fullname,
      username,
      email,
      password: hashedpassword,
      isVerified: false,
    });

    console.log("💾 Saving new user...");

    // Save user with timeout
    await Promise.race([
      newUser.save(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database save timeout")), 15000)
      ),
    ]);

    console.log("✅ User saved successfully");

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Save verification token to database
    emailToken = new eMailToken({
      userId: newUser._id,
      eMailToken: verificationToken,
    });

    await emailToken.save();
    console.log("✅ Email verification token saved");

    // Send verification email
    const verificationUrl = `https://talkora-private-chat.up.railway.app/api/auth/verify-email/${verificationToken}`;
    const emailSubject = "Email Verification";
    const emailText = `
      Hi ${fullname},
      
      Thank you for signing up! Please verify your email address by clicking the link below:
      
<a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);"> ✅ Verify Email </a>
      
      This link will expire in 1 hour.
      
      If you didn't create an account, please ignore this email.
      
      Best regards,
      Talkora - Private Chat Team
      `;

    await sendEmail(email, emailSubject, emailText);
    console.log("✅ Verification email sent");

    console.log("✅ Signup completed successfully");

    res.status(201).json({
      message:
        "User created successfully. Please check your email to verify your account.",
      user: {
        _id: newUser._id,
        id: newUser._id,
        fullname: newUser.fullname,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profilePic,
        isVerified: newUser.isVerified,
      },
    });
  } catch (error) {
    console.error("❌ Signup error:", error.message);
    console.error("Error stack:", error.stack);

    // Cleanup on email failure
    if (
      newUser &&
      newUser._id &&
      error.message.includes("Failed to send email")
    ) {
      console.log("🧹 Cleaning up user and token due to email failure");
      try {
        await User.deleteOne({ _id: newUser._id });
        if (emailToken && emailToken._id) {
          await eMailToken.deleteOne({ _id: emailToken._id });
        }
        console.log("✅ Cleanup completed");
      } catch (cleanupError) {
        console.error("❌ Cleanup failed:", cleanupError);
      }
    }

    // Handle specific timeout errors
    if (
      error.message.includes("timeout") ||
      error.message.includes("buffering timed out")
    ) {
      return res.status(503).json({
        message: "Database connection timeout. Please try again.",
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        message: "User with this email already exists",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

// Email verification controller
export const verifyEmail = async (req, res) => {
  const { token } = req.params;

  try {
    console.log("📧 Email verification attempt with token:", token);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for email verification");

    // Find the token in database
    const emailToken = await eMailToken.findOne({ eMailToken: token });

    if (!emailToken) {
      return res.status(400).json({
        message: "Invalid or expired verification token",
      });
    }

    console.log("✅ Email token found");

    // Find the user associated with this token
    const user = await User.findById(emailToken.userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified",
      });
    }

    // Update user verification status
    user.isVerified = true;
    await user.save();

    // Delete the token after successful verification
    await eMailToken.deleteOne({ _id: emailToken._id });

    console.log("✅ Email verified successfully");

    res.status(200).json({
      message: "Email verified successfully! You can now log in.",
    });
  } catch (error) {
    console.error("❌ Email verification error:", error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json({ message: "Internal server error" });
  }
};

// Resend verification email controller
export const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  try {
    console.log("📧 Resend verification email for:", email);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for resend verification");

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified",
      });
    }

    // Delete any existing tokens for this user
    await eMailToken.deleteMany({ userId: user._id });

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Save new verification token to database
    const emailToken = new eMailToken({
      userId: user._id,
      eMailToken: verificationToken,
    });

    await emailToken.save();
    console.log("✅ New email verification token saved");

    // Send verification email
    const verificationUrl = `${process.env.BASE_URL}/api/auth/verify-email/${verificationToken}`;
    const emailSubject = "Email Verification - Resent";
    const emailText = `
      Hi ${user.fullname},
      
      Here's your email verification link:
      
      ${verificationUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request this, please ignore this email.
      
      Best regards,
      Your App Team
    `;

    await sendEmail(email, emailSubject, emailText);
    console.log("✅ Verification email resent");

    res.status(200).json({
      message: "Verification email sent successfully. Please check your email.",
    });
  } catch (error) {
    console.error("❌ Resend verification error:", error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json({ message: "Internal server error" });
  }
};

//Login controller
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("🔐 Login attempt for:", email);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for login");

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    //checking user with timeout - need to explicitly select password since it's excluded by default
    const user = await Promise.race([
      User.findOne({ email }).select("+password"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 10000)
      ),
    ]);

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log("✅ User found");

    //checking pass
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log("✅ Password valid");

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(400).json({
        message: "Please verify your email before logging in.",
        requiresVerification: true,
      });
    }

    // Generate token AFTER verification check
    genToken(user._id, res);

    console.log("✅ Login successful");

    res.status(200).json({
      _id: user._id,
      id: user._id,
      fullname: user.fullname,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      about: user.about,
      createdAt: user.createdAt,
      isVerified: user.isVerified,
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    console.error("Error stack:", error.stack);

    // Handle specific timeout errors
    if (
      error.message.includes("timeout") ||
      error.message.includes("buffering timed out")
    ) {
      return res.status(503).json({
        message: "Database connection timeout. Please try again.",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

//Logout controller
export const logout = (req, res) => {
  try {
    console.log("🚪 Logout request received");

    res.cookie("token", "", {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    console.log("✅ Logout successful");
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//Profile update controller - UPDATED TO INCLUDE ABOUT FIELD
export const updateProfile = async (req, res) => {
  try {
    console.log("🖼️ Profile update request received");

    // Ensure database connection
    await connectDB();

    const { profilePic, about } = req.body;
    const userId = req.user._id;

    // Validate that at least one field is provided
    if (!profilePic && !about) {
      return res.status(400).json({ 
        message: "At least one field (profilePic or about) is required" 
      });
    }

    // Validate about field length if provided
    if (about && about.length > 200) {
      return res.status(400).json({ 
        message: "About field cannot exceed 200 characters" 
      });
    }

    let updateData = {};

    // Handle profile picture update
    if (profilePic) {
      console.log("☁️ Uploading to cloudinary...");
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      console.log("✅ Cloudinary upload successful");
      updateData.profilePic = uploadResponse.secure_url;
    }

    // Handle about field update
    if (about !== undefined) {
      updateData.about = about;
    }

    const updatedUser = await Promise.race([
      User.findByIdAndUpdate(userId, updateData, { new: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database update timeout")), 10000)
      ),
    ]);

    console.log("✅ Profile updated successfully");

    res.status(200).json({
      updatedUser: {
        _id: updatedUser._id,
        id: updatedUser._id,
        fullname: updatedUser.fullname,
        username: updatedUser.username,
        email: updatedUser.email,
        profilePic: updatedUser.profilePic,
        about: updatedUser.about,
        createdAt: updatedUser.createdAt,
        isVerified: updatedUser.isVerified,
      },
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("❌ Profile update error:", error);

    // Handle specific timeout errors
    if (
      error.message.includes("timeout") ||
      error.message.includes("buffering timed out")
    ) {
      return res.status(503).json({
        message: "Database connection timeout. Please try again.",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

//checkAuth controller
export const checkAuth = async (req, res) => {
  try {
    console.log("🔍 Auth check for user:", req.user._id);

    // Return user data with consistent structure
    const userData = {
      _id: req.user._id,
      id: req.user._id,
      fullname: req.user.fullname,
      username: req.user.username,
      email: req.user.email,
      profilePic: req.user.profilePic,
      about: req.user.about,
      createdAt: req.user.createdAt,
      isVerified: req.user.isVerified,
    };

    console.log("✅ Auth check successful");
    res.status(200).json(userData);
  } catch (error) {
    console.error("❌ Check auth error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// NEW: Get user profile controller
export const getUserProfile = async (req, res) => {
  try {
    console.log("👤 Get user profile request for:", req.params.userId);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for user profile");

    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: "Invalid user ID" 
      });
    }

    // Find user by ID with timeout
    const user = await Promise.race([
      User.findById(userId).select('fullname username profilePic about createdAt isDeleted'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 10000)
      ),
    ]);

    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    // Check if user account is deleted
    if (user.isDeleted) {
      return res.status(200).json({
        user: {
          _id: user._id,
          id: user._id,
          fullname: "Talkora xUser",
          username: "",
          profilePic: "",
          about: "",
          createdAt: user.createdAt,
          isDeleted: true,
        },
        message: "User profile retrieved successfully"
      });
    }
    
    // Check if the requested user has blocked the current user
    const currentUser = await User.findById(req.user._id);
    if (user.isBlocked(req.user._id)) {
      // If blocked, hide profile information
      return res.status(200).json({
        user: {
          _id: user._id,
          id: user._id,
          fullname: user.fullname, // Show name but hide other details
          username: "",
          profilePic: "", // Hide profile picture
          about: "",
          createdAt: user.createdAt,
          isDeleted: false,
          isBlocked: true,
          isOnline: false, // Hide online status
          lastSeen: null, // Hide last seen
          formattedLastSeen: null
        },
        message: "User profile retrieved successfully"
      });
    }

    console.log("✅ User profile retrieved successfully");

    res.status(200).json({
      user: {
        _id: user._id,
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        profilePic: user.profilePic,
        about: user.about,
        createdAt: user.createdAt,
        isDeleted: false,
        isBlocked: false,
        isOnline: user.isOnline || false,
        lastSeen: user.lastSeen,
        formattedLastSeen: user.getFormattedLastSeen()
      },
      message: "User profile retrieved successfully"
    });
  } catch (error) {
    console.error("❌ Get user profile error:", error.message);
    console.error("Error stack:", error.stack);

    // Handle specific timeout errors
    if (
      error.message.includes("timeout") ||
      error.message.includes("buffering timed out")
    ) {
      return res.status(503).json({
        message: "Database connection timeout. Please try again.",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete account controller
export const deleteAccount = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    console.log("🗑️ Account deletion request for user:", req.user._id);

    // Ensure database connection
    await connectDB();
    console.log("✅ Database connected for account deletion");

    await session.withTransaction(async () => {
      const userId = req.user._id;
      const userEmail = req.user.email;

      // Step 1: Update user data to show as deleted account
      await User.findByIdAndUpdate(
        userId,
        {
          fullname: "Talkora xUser",
          username: `deleted_user_${Date.now()}`, // Ensure unique username
          email: `deleted_${Date.now()}@deleted.com`, // Ensure unique email
          profilePic: "", // Remove profile picture
          about: "", // Clear about field
          isOnline: false,
          isVerified: false,
          password: "", // Clear password
          friends: [], // Remove all friends
          isDeleted: true, // Add this field to mark as deleted
          deletedAt: new Date(),
        },
        { session }
      );

      // Step 2: Remove user from all friends' friend lists
      await User.updateMany(
        { friends: userId },
        { $pull: { friends: userId } },
        { session }
      );

      // Step 3: Delete all friend requests involving this user
      await FriendRequest.deleteMany(
        {
          $or: [{ senderId: userId }, { receiverId: userId }],
        },
        { session }
      );

      // Step 4: Update messages to show account deletion
      // Update messages where user was sender
      await Message.updateMany(
        { senderId: userId },
        {
          $set: {
            senderName: "Talkora User",
            senderProfilePic: "",
            isDeleted: true,
          },
        },
        { session }
      );

      // Step 5: Add system message about account deletion to all conversations
      const userConversations = await Message.distinct("conversationId", {
        $or: [{ senderId: userId }, { receiverId: userId }],
      });

      // Add deletion notification message to each conversation
      for (const conversationId of userConversations) {
        const otherUserId = conversationId
          .split("-")
          .find((id) => id !== userId.toString());
        if (otherUserId) {
          await Message.create(
            [
              {
                senderId: userId,
                receiverId: otherUserId,
                message: "User deleted their account!",
                messageType: "system",
                isSystemMessage: true,
                conversationId: conversationId,
                senderName: "Talkora User",
                senderProfilePic: "",
                isDeleted: true,
                createdAt: new Date(),
              },
            ],
            { session }
          );
        }
      }

      // Step 6: Delete email verification tokens
      await eMailToken.deleteMany({ userId: userId }, { session });

      console.log("✅ Account deletion completed successfully");
    });

    // Step 7: Notify all connected users about the account deletion
    // Get all users who were friends with the deleted user
    const affectedUsers = await User.find({
      friends: req.user._id,
    }).select("_id");

    // Emit socket events to notify friends about the deletion
    affectedUsers.forEach((user) => {
      const userSocketId = getReceiverSocketId(user._id.toString());
      if (userSocketId) {
        io.to(userSocketId).emit("userAccountDeleted", {
          deletedUserId: req.user._id,
          message: "A user has deleted their account",
        });
      }
    });

    // Clear the user's cookie
    res.cookie("token", "", {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    console.log("✅ Account deletion notification sent");

    res.status(200).json({
      message: "Account deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("❌ Account deletion error:", error.message);
    console.error("Error stack:", error.stack);

    // Handle specific timeout errors
    if (
      error.message.includes("timeout") ||
      error.message.includes("buffering timed out")
    ) {
      return res.status(503).json({
        message: "Database connection timeout. Please try again.",
      });
    }

    res.status(500).json({
      message: "Internal server error during account deletion",
      success: false,
    });
  } finally {
    await session.endSession();
  }
};

// Block user controller
export const blockUser = async (req, res) => {
  try {
    console.log("🚫 Block user request from:", req.user._id, "to:", req.params.userId);
    
    // Ensure database connection
    await connectDB();
    
    const { userId } = req.params;
    const blockerId = req.user._id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: "Invalid user ID" 
      });
    }
    
    // Can't block yourself
    if (userId === blockerId.toString()) {
      return res.status(400).json({ 
        message: "Cannot block yourself" 
      });
    }
    
    // Check if user to block exists
    const userToBlock = await User.findById(userId);
    if (!userToBlock) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }
    
    // Check if user is already blocked
    const blocker = await User.findById(blockerId);
    if (blocker.isBlocked(userId)) {
      return res.status(400).json({ 
        message: "User is already blocked" 
      });
    }
    
    // Block the user
    await blocker.blockUser(userId);
    
    console.log("✅ User blocked successfully");
    
    res.status(200).json({
      message: "User blocked successfully",
      blockedUserId: userId
    });
  } catch (error) {
    console.error("❌ Block user error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Unblock user controller
export const unblockUser = async (req, res) => {
  try {
    console.log("✅ Unblock user request from:", req.user._id, "to:", req.params.userId);
    
    // Ensure database connection
    await connectDB();
    
    const { userId } = req.params;
    const unblockerId = req.user._id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: "Invalid user ID" 
      });
    }
    
    // Can't unblock yourself
    if (userId === unblockerId.toString()) {
      return res.status(400).json({ 
        message: "Cannot unblock yourself" 
      });
    }
    
    // Check if user is blocked
    const unblocker = await User.findById(unblockerId);
    if (!unblocker.isBlocked(userId)) {
      return res.status(400).json({ 
        message: "User is not blocked" 
      });
    }
    
    // Unblock the user
    await unblocker.unblockUser(userId);
    
    console.log("✅ User unblocked successfully");
    
    res.status(200).json({
      message: "User unblocked successfully",
      unblockedUserId: userId
    });
  } catch (error) {
    console.error("❌ Unblock user error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get blocked users controller
export const getBlockedUsers = async (req, res) => {
  try {
    console.log("📝 Get blocked users request from:", req.user._id);
    
    // Ensure database connection
    await connectDB();
    
    const user = await User.findById(req.user._id).populate({
      path: 'blockedUsers',
      select: 'fullname username profilePic'
    });
    
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }
    
    console.log("✅ Blocked users retrieved successfully");
    
    res.status(200).json({
      blockedUsers: user.blockedUsers || [],
      message: "Blocked users retrieved successfully"
    });
  } catch (error) {
    console.error("❌ Get blocked users error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get last seen information for a user
export const getLastSeen = async (req, res) => {
  try {
    console.log("🕓 Get last seen request for:", req.params.userId);
    
    // Ensure database connection
    await connectDB();
    
    const { userId } = req.params;
    const currentUserId = req.user._id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: "Invalid user ID" 
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }
    
    // Check if current user is blocked by the requested user
    if (user.isBlocked(currentUserId)) {
      return res.status(200).json({
        isOnline: false,
        lastSeen: null,
        formattedLastSeen: "Last seen information hidden",
        isBlocked: true,
        message: "Last seen information retrieved successfully"
      });
    }
    
    console.log("✅ Last seen information retrieved successfully");
    
    res.status(200).json({
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen,
      formattedLastSeen: user.getFormattedLastSeen(),
      isBlocked: false,
      message: "Last seen information retrieved successfully"
    });
  } catch (error) {
    console.error("❌ Get last seen error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Check if user is blocked
export const checkBlockStatus = async (req, res) => {
  try {
    console.log("🔍 Check block status request from:", req.user._id, "for:", req.params.userId);
    
    // Ensure database connection
    await connectDB();
    
    const { userId } = req.params;
    const currentUserId = req.user._id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        message: "Invalid user ID" 
      });
    }
    
    const currentUser = await User.findById(currentUserId);
    const otherUser = await User.findById(userId);
    
    if (!currentUser || !otherUser) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }
    
    const isBlocked = currentUser.isBlocked(userId);
    const isBlockedBy = otherUser.isBlocked(currentUserId);
    
    console.log("✅ Block status checked successfully");
    
    res.status(200).json({
      isBlocked,
      isBlockedBy,
      message: "Block status retrieved successfully"
    });
  } catch (error) {
    console.error("❌ Check block status error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
