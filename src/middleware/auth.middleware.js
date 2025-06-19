import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

export const protectRoute = async (req, res, next) => {
  try {
    console.log("Cookies received:", req.cookies);
    const token = req.cookies.token;

    if (!token) {
      console.log("No token found in cookies");
      return res.status(401).json({ message: "Unauthorized!" });
    }

    console.log("Token found, verifying...");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded:", decoded);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in protectRoute middleware:", error.message);
    return res.status(401).json({ 
      message: "Unauthorized!",
      error: error.message
    });
  }
};