import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
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
    text: {
      type: String,
    },
    image: {
      type: String,
    },
    // NEW FIELDS FOR ACCOUNT DELETION SUPPORT
    message: {
      type: String,
      // This field will be used for both text and system messages
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'system'],
      default: 'text',
    },
    conversationId: {
      type: String,
      required: true,
      // Format: "userId1-userId2" (sorted)
    },
    senderName: {
      type: String,
      // Store sender name to handle deleted accounts
    },
    senderProfilePic: {
      type: String,
      // Store sender profile pic to handle deleted accounts
    },
    isDeleted: {
      type: Boolean,
      default: false,
      // Mark if message is from deleted account
    },
    isSystemMessage: {
      type: Boolean,
      default: false,
      // Mark system messages (like account deletion notifications)
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ receiverId: 1 });
messageSchema.index({ isSystemMessage: 1 });
messageSchema.index({ isDeleted: 1 });

// Method to create conversation ID consistently
messageSchema.statics.createConversationId = function(userId1, userId2) {
  return [userId1.toString(), userId2.toString()].sort().join('-');
};

// Method to get messages for a conversation with deleted account handling
messageSchema.statics.getConversationMessages = async function(userId1, userId2, limit = 50, page = 1) {
  const conversationId = this.createConversationId(userId1, userId2);
  const skip = (page - 1) * limit;
  
  return this.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Method to format message for deleted accounts
messageSchema.methods.getFormattedMessage = function() {
  return {
    _id: this._id,
    senderId: this.senderId,
    receiverId: this.receiverId,
    message: this.message || this.text, // Support both fields
    image: this.image,
    messageType: this.messageType,
    conversationId: this.conversationId,
    senderName: this.isDeleted ? "Talkora User" : this.senderName,
    senderProfilePic: this.isDeleted ? "" : this.senderProfilePic,
    isDeleted: this.isDeleted,
    isSystemMessage: this.isSystemMessage,
    isRead: this.isRead,
    readAt: this.readAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Method to create system message for account deletion
messageSchema.statics.createAccountDeletionMessage = async function(deletedUserId, conversationPartnerIds) {
  const deletionMessages = [];
  
  for (const partnerId of conversationPartnerIds) {
    const conversationId = this.createConversationId(deletedUserId, partnerId);
    
    const systemMessage = new this({
      senderId: deletedUserId,
      receiverId: partnerId,
      message: "User deleted their account!",
      messageType: "system",
      conversationId: conversationId,
      senderName: "Talkora User",
      senderProfilePic: "",
      isSystemMessage: true,
      isDeleted: true,
    });
    
    deletionMessages.push(systemMessage);
  }
  
  return this.insertMany(deletionMessages);
};

// Pre-save middleware to ensure message content is in the right field
messageSchema.pre('save', function(next) {
  // If text exists but message doesn't, copy text to message
  if (this.text && !this.message) {
    this.message = this.text;
  }
  
  // If this is a system message, ensure proper flags are set
  if (this.isSystemMessage) {
    this.messageType = 'system';
  }
  
  next();
});

const Message = mongoose.model("Message", messageSchema);
export default Message;