// Updated User.model.js - Add these fields to your existing schema

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
      unique: true,
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
      select: false,
    },
    profilePic: {
      type: String,
      default: "",
    },
    about: {
      type: String,
      default: "Yes, I am using Talko!",
      maxlength: 200, // Optional: Limit the length of the about field
    },
    // FIELDS FOR FRIENDS AND LAST SEEN
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    // FIELDS FOR ACCOUNT VERIFICATION
    isVerified: {
      type: Boolean,
      default: false,
    },
    // FIELDS FOR ACCOUNT DELETION
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Existing indexes
userSchema.index({ friends: 1 });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

// NEW INDEX for deleted accounts
userSchema.index({ isDeleted: 1 });

// Updated method to check if user is deleted
userSchema.methods.isAccountDeleted = function () {
  return this.isDeleted === true;
};

// Method to get safe user data (for deleted accounts)
userSchema.methods.getSafeUserData = function () {
  if (this.isDeleted) {
    return {
      _id: this._id,
      id: this._id,
      fullname: "Talko xUser",
      username: "", // Don't show username for deleted accounts
      email: "", // Don't show email for deleted accounts
      profilePic: "",
      isOnline: false,
      isDeleted: true,
      friends: [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  return {
    _id: this._id,
    id: this._id,
    fullname: this.fullname,
    username: this.username,
    email: this.email,
    profilePic: this.profilePic,
    isOnline: this.isOnline,
    isDeleted: false,
    friends: this.friends || [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Existing methods
userSchema.methods.addFriend = function (friendId) {
  if (!this.friends.includes(friendId)) {
    this.friends.push(friendId);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.removeFriend = function (friendId) {
  this.friends = this.friends.filter((id) => !id.equals(friendId));
  return this.save();
};

userSchema.methods.isFriendsWith = function (userId) {
  return this.friends.some((friendId) => friendId.equals(userId));
};

const User = mongoose.model("User", userSchema);
export default User;
