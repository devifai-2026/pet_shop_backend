import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  resetPasswordOTP: {
    code: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 }
  }
}, { timestamps: true });

export default mongoose.model("Admin", adminSchema);