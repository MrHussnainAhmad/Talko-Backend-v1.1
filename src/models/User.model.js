import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true, // Added unique constraint for username
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // Exclude password from queries by default
    },
    profilePic: {
      type: String,
      default: "", // Default profile picture URL
    },
    // Array to store friend IDs for faster friend queries
    friends: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    // Optional: Add online status
    isOnline: {
      type: Boolean,
      default: false,
    },
    // Optional: Last seen timestamp
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, 
  }
);

// Index for faster friend queries
userSchema.index({ friends: 1 });

// Index for username searches
userSchema.index({ username: 1 });

// Index for email searches
userSchema.index({ email: 1 });

// Method to add friend to friends array
userSchema.methods.addFriend = function(friendId) {
  if (!this.friends.includes(friendId)) {
    this.friends.push(friendId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove friend from friends array
userSchema.methods.removeFriend = function(friendId) {
  this.friends = this.friends.filter(id => !id.equals(friendId));
  return this.save();
};

// Method to check if user is friends with another user
userSchema.methods.isFriendsWith = function(userId) {
  return this.friends.some(friendId => friendId.equals(userId));
};

const User = mongoose.model("User", userSchema);
export default User;