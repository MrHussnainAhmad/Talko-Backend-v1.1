import mongoose from "mongoose";
const Schema = mongoose.Schema;

const tokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // Ensure one token per user
  },
  eMailToken: {
    type: String,
    required: true,
    unique: true, // Ensure token uniqueness
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "1h", // Token will expire after 1 hour
  },
});

const eMailToken = mongoose.model("eMailToken", tokenSchema);
export default eMailToken;
