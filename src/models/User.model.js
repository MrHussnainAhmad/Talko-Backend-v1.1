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
      default: "Yes, I am using Talkora!",
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
    // FIELDS FOR BLOCKING USERS
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
    // FIELDS FOR PUSH NOTIFICATIONS
    fcmTokens: [{
      token: String,
      platform: {
        type: String,
        enum: ['web', 'ios', 'android'],
        required: true
      },
      deviceId: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    // FIELDS FOR UNREAD NOTIFICATIONS
    unreadNotifications: [{
      type: {
        type: String,
        required: true
      },
      title: String,
      body: String,
      data: mongoose.Schema.Types.Mixed,
      read: {
        type: Boolean,
        default: false
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
  },
  {
    timestamps: true,
  }
);

// Existing indexes
userSchema.index({ friends: 1 });
userSchema.index({ blockedUsers: 1 });
userSchema.index({ lastSeen: 1 });
userSchema.index({ isOnline: 1 });

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
      fullname: "Talkora xUser",
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

// Blocking methods
userSchema.methods.blockUser = function (userId) {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.unblockUser = function (userId) {
  this.blockedUsers = this.blockedUsers.filter((id) => !id.equals(userId));
  return this.save();
};

userSchema.methods.isBlocked = function (userId) {
  return this.blockedUsers.some((blockedId) => blockedId.equals(userId));
};

userSchema.methods.isBlockedBy = async function (userId) {
  const user = await this.constructor.findById(userId);
  return user ? user.isBlocked(this._id) : false;
};

// Method to update last seen
userSchema.methods.updateLastSeen = function () {
  this.lastSeen = new Date();
  return this.save();
};

// Method to get formatted last seen
userSchema.methods.getFormattedLastSeen = function () {
  if (this.isOnline) {
    return "online";
  }
  
  const now = new Date();
  const lastSeen = new Date(this.lastSeen);
  const diffInMs = now - lastSeen;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInMinutes < 60) {
    return `last seen today at ${diffInMinutes} mins ago`;
  } else if (diffInHours < 6) {
    return `last seen today at ${diffInHours} hours ago`;
  } else if (diffInHours < 24) {
    const hours = lastSeen.getHours().toString().padStart(2, '0');
    const minutes = lastSeen.getMinutes().toString().padStart(2, '0');
    return `last seen today at ${hours}:${minutes} mins ago`;
  } else if (diffInDays === 1) {
    const hours = lastSeen.getHours().toString().padStart(2, '0');
    const minutes = lastSeen.getMinutes().toString().padStart(2, '0');
    return `last seen yesterday at ${hours}:${minutes}`;
  } else if (diffInDays < 7) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[lastSeen.getDay()];
    const hours = lastSeen.getHours().toString().padStart(2, '0');
    const minutes = lastSeen.getMinutes().toString().padStart(2, '0');
    return `last seen on ${dayOfWeek} at ${hours}:${minutes}`;
  } else {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const dayOfWeek = dayNames[lastSeen.getDay()];
    const day = lastSeen.getDate();
    const month = monthNames[lastSeen.getMonth()];
    const hours = lastSeen.getHours().toString().padStart(2, '0');
    const minutes = lastSeen.getMinutes().toString().padStart(2, '0');
    return `last seen on ${dayOfWeek}, ${day} ${month} at ${hours}:${minutes}`;
  }
};

const User = mongoose.model("User", userSchema);
export default User;
