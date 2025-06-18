import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_URI);
    console.log("Database connected successfully");
  } catch (error) {
    console.log("Database connection failed:", error.message);
    process.exit(1); // Exit the process with failure
  }
};
