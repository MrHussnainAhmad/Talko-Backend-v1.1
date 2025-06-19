import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted"], // Removed "rejected" since we delete rejected requests
      default: "pending",
    },
    // Optional: Add a message field for the friend request
    message: {
      type: String,
      maxlength: 200,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate friend requests between same users
friendRequestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

// Index for faster queries on status
friendRequestSchema.index({ status: 1 });

// Index for finding requests by receiver (for incoming requests)
friendRequestSchema.index({ receiverId: 1, status: 1 });

// Index for finding requests by sender (for outgoing requests)
friendRequestSchema.index({ senderId: 1, status: 1 });

// Pre-save middleware to prevent users from sending friend requests to themselves
friendRequestSchema.pre("save", function (next) {
  if (this.senderId.toString() === this.receiverId.toString()) {
    const error = new Error("Cannot send friend request to yourself");
    return next(error);
  }
  next();
});

// Static method to check if users are friends
friendRequestSchema.statics.areFriends = async function (userId1, userId2) {
  const friendship = await this.findOne({
    $or: [
      { senderId: userId1, receiverId: userId2, status: "accepted" },
      { senderId: userId2, receiverId: userId1, status: "accepted" },
    ],
  });
  return !!friendship;
};

// Static method to get all friends of a user
friendRequestSchema.statics.getFriends = async function (userId) {
  const friendships = await this.find({
    $or: [
      { senderId: userId, status: "accepted" },
      { receiverId: userId, status: "accepted" },
    ],
  }).populate("senderId receiverId", "fullname username email profilePic");

  // Map to get the friend's data (not the current user's data)
  return friendships.map((friendship) => {
    return friendship.senderId._id.toString() === userId.toString()
      ? friendship.receiverId
      : friendship.senderId;
  });
};

// Updated static method to check if pending request exists (simplified)
friendRequestSchema.statics.requestExists = async function (senderId, receiverId) {
  const existingRequest = await this.findOne({
    $or: [
      { senderId: senderId, receiverId: receiverId, status: "pending" },
      { senderId: receiverId, receiverId: senderId, status: "pending" },
    ],
  });
  return existingRequest;
};

// New static method to clean up old rejected requests (optional maintenance)
friendRequestSchema.statics.cleanupRejectedRequests = async function () {
  // This method can be called periodically to clean up any rejected requests
  // that might still exist in the database from before this update
  await this.deleteMany({ status: "rejected" });
};

const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);
export default FriendRequest;