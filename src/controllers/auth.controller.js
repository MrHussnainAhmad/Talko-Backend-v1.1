import User from "../models/User.model.js";
import bcrypt from "bcryptjs";
import { genToken } from "../lib/utils.js";
import cloudinary from "../lib/cloudinary.js";
import { connectDB } from "../lib/db.js";

//signup controller
export const signup = async (req, res) => {
  const { fullname, username, email, password } = req.body;

  try {
    console.log('🔐 Signup attempt for:', email);
    
    // Ensure database connection
    await connectDB();
    console.log('✅ Database connected for signup');

    // Validate input
    if (!fullname || !username || !email || !password) {
      return res.status(400).json({ 
        message: "All fields are required" 
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
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      )
    ]);
    
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    console.log('✅ Email is available');

    //Hashing Pass
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullname,
      username,
      email,
      password: hashedpassword,
    });

    console.log('💾 Saving new user...');
    
    // Save user with timeout
    await Promise.race([
      newUser.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database save timeout')), 15000)
      )
    ]);

    console.log('✅ User saved successfully');

    // Generate token
    genToken(newUser._id, res);
    
    console.log('✅ Signup completed successfully');

    res.status(201).json({
      message: "User created successfully",
      user: {
        _id: newUser._id, // Make sure to include _id
        id: newUser._id,
        fullname: newUser.fullname,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profilePic,
      },
    });
  } catch (error) {
    console.error("❌ Signup error:", error.message);
    console.error("Error stack:", error.stack);
    
    // Handle specific timeout errors
    if (error.message.includes('timeout') || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        message: 'Database connection timeout. Please try again.' 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'User with this email already exists' 
      });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

//Login controller
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('🔐 Login attempt for:', email);
    
    // Ensure database connection
    await connectDB();
    console.log('✅ Database connected for login');

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required' 
      });
    }

    //checking user with timeout - need to explicitly select password since it's excluded by default
    const user = await Promise.race([
      User.findOne({ email }).select("+password"),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      )
    ]);
    
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log('✅ User found');

    //checking pass
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    
    console.log('✅ Password valid');
    
    //Generate token
    genToken(user._id, res);

    console.log('✅ Login successful');

    res.status(200).json({
      _id: user._id, // Make sure to include _id
      id: user._id,
      fullname: user.fullname,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    console.error("Error stack:", error.stack);
    
    // Handle specific timeout errors
    if (error.message.includes('timeout') || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        message: 'Database connection timeout. Please try again.' 
      });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

//Logout controller
export const logout = (req, res) => {
  try {
    console.log('🚪 Logout request received');
    
    res.cookie("token", "", {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    
    console.log('✅ Logout successful');
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//Profile update controller
export const updateProfile = async (req, res) => {
  try {
    console.log('🖼️ Profile update request received');
    
    // Ensure database connection
    await connectDB();
    
    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    console.log('☁️ Uploading to cloudinary...');
    const uploadResponse = await cloudinary.uploader.upload(profilePic);
    console.log('✅ Cloudinary upload successful');

    const updatedUser = await Promise.race([
      User.findByIdAndUpdate(
        userId,
        { profilePic: uploadResponse.secure_url },
        { new: true }
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database update timeout')), 10000)
      )
    ]);

    console.log('✅ Profile updated successfully');

    res.status(200).json({ 
      updatedUser, 
      message: "Profile picture updated successfully" 
    });
  } catch (error) {
    console.error("❌ Profile update error:", error);
    
    // Handle specific timeout errors
    if (error.message.includes('timeout') || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        message: 'Database connection timeout. Please try again.' 
      });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

//checkAuth controller
export const checkAuth = async (req, res) => {
  try {
    console.log('🔍 Auth check for user:', req.user._id);
    
    // Return user data with consistent structure
    const userData = {
      _id: req.user._id,
      id: req.user._id,
      fullname: req.user.fullname,
      username: req.user.username,
      email: req.user.email,
      profilePic: req.user.profilePic,
    };
    
    console.log('✅ Auth check successful');
    res.status(200).json(userData);
  } catch (error) {
    console.error("❌ Check auth error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};