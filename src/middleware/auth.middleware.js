import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized!" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Remove the (!decoded) check - jwt.verify throws on invalid tokens

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in protectRoute middleware:", error);
    // This will catch JWT verification errors and invalid tokens
    return res.status(401).json({ message: "Unauthorized!" });
  }
};