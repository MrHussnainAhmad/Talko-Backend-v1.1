import User from "../models/User.model.js";
import bcrypt from "bcryptjs";
import { genToken } from "../lib/utils.js";
import cloudinary from "../lib/cloudinary.js";
import { connectDB } from "../lib/db.js";

//signup controller
export const signup = async (req, res) => {
  const { fullname, username, email, password } = req.body;

  try {
    // Ensure database connection
    await connectDB();

    //Checking Password Length
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    //Checking Email
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    //Hashing Pass
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullname,
      username,
      email,
      password: hashedpassword,
    });

    if (newUser) {
      genToken(newUser._id, res);
      await newUser.save();
      res.status(201).json({
        message: "User created successfully",
        user: {
          id: newUser._id,
          fullname: newUser.fullname,
          username: newUser.username,
          email: newUser.email,
          profilePic: newUser.profilePic,
        },
      });
    } else {
      console.error("Failed to create user");
      res.status(500).json({ message: "Internal Error!" });
    }
  } catch (error) {
    console.error("Signup error:", error);
    
    // Handle specific timeout errors
    if (error.message.includes('timeout') || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        message: 'Database connection timeout. Please try again.' 
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

    //checking user - need to explicitly select password since it's excluded by default
    const user = await Promise.race([
      User.findOne({ email }).select("+password"),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      )
    ]);
    
    if (!user) {
      return res.status(400).json({ message: "Email not found" });
    }

    console.log('✅ User found');

    //checking pass
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }
    
    console.log('✅ Password valid');
    
    //Generate token
    genToken(user._id, res);

    console.log('✅ Login successful');

    res.status(200).json({
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
    res.cookie("token", "", {
      maxAge: 0,
    });
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//Profile update controller
export const updateProfile = async (req, res) => {
  try {
    // Ensure database connection
    await connectDB();
    
    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    res
      .status(200)
      .json({ updatedUser, message: "Profile picture updated successfully" });
  } catch (error) {
    console.error("Profile update error:", error);
    
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
    res.status(200).json(req.user);
  } catch (error) {
    console.error("Check auth error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};