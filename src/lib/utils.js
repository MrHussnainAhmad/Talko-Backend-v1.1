/**
 * This backend is Created by Hussnain Ahmad, You can check full app on github at: 'https://github.com/MrHussnainAhmad/'
 */
import jwt from "jsonwebtoken";

export const genToken = (userId, res) => {
  console.log('🔑 Generating token for user:', userId);
  
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is not defined');
    throw new Error('JWT_SECRET is not configured');
  }
  
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  const cookieOptions = {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Use secure cookies in production
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Allow cross-site cookies in production
  };

  console.log('🍪 Setting cookie with options:', cookieOptions);
  
  res.cookie("token", token, cookieOptions);

  console.log('✅ Token generated and cookie set');
  return token;
};