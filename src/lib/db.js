import mongoose from "mongoose";

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      maxIdleTimeMS: 30000,
      retryWrites: true,
      w: 'majority'
    };

    cached.promise = mongoose.connect(process.env.DB_URI, opts).then((mongoose) => {
      console.log("✅ Database connected successfully");
      return mongoose;
    }).catch((error) => {
      console.error("❌ Database connection failed:", error.message);
      cached.promise = null;
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error("Database connection error:", error);
    throw error;
  }

  return cached.conn;
};