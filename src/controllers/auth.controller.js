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
    const verificationUrl = `https://talko-private-chat.up.railway.app/api/auth/verify-email/${verificationToken}`;
    const emailSubject = "Email Verification";
    const emailText = `
      Hi ${fullname},
      
      Thank you for signing up! Please verify your email address by clicking the link below:
      
<a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);"> ✅ Verify Email </a>
      
      This link will expire in 1 hour.
      
      If you didn't create an account, please ignore this email.
      
      Best regards,
      Talko - Private Chat Team
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

//Profile update controller
export const updateProfile = async (req, res) => {
  try {
    console.log("🖼️ Profile update request received");

    // Ensure database connection
    await connectDB();

    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    console.log("☁️ Uploading to cloudinary...");
    const uploadResponse = await cloudinary.uploader.upload(profilePic);
    console.log("✅ Cloudinary upload successful");

    const updatedUser = await Promise.race([
      User.findByIdAndUpdate(
        userId,
        { profilePic: uploadResponse.secure_url },
        { new: true }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database update timeout")), 10000)
      ),
    ]);

    console.log("✅ Profile updated successfully");

    res.status(200).json({
      updatedUser,
      message: "Profile picture updated successfully",
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
      isVerified: req.user.isVerified,
    };

    console.log("✅ Auth check successful");
    res.status(200).json(userData);
  } catch (error) {
    console.error("❌ Check auth error:", error);
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
          fullname: "Talko User",
          username: `deleted_user_${Date.now()}`, // Ensure unique username
          email: `deleted_${Date.now()}@deleted.com`, // Ensure unique email
          profilePic: "", // Remove profile picture
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
            senderName: "Talko User",
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
                senderName: "Talko User",
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
