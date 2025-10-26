import mongoose from "mongoose";
import addressSchema from "../order/address.model.js";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    phone: String,
    address: addressSchema,
    otp: String,
    otpExpires: Date,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
