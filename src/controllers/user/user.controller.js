import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import User from "../../models/user/user.model.js";
import sendEmail from "../../services/mailer.js";
import { generateEmailHtml } from "./../../services/templateUtils.js";

// Helper to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Register
export const createAccount = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Name, Email, and Password are required")
      );
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Please provide a valid email address"));
  }

  // Check password strength (minimum 8 chars, 1 number, 1 special char)
  if (
    password.length < 8 ||
    !/\d/.test(password) ||
    !/[!@#$%^&*]/.test(password)
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Password must be at least 8 characters with 1 number and 1 special character"
        )
      );
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res
      .status(409)
      .json(new ApiResponse(409, null, "Email already registered"));
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      address,
    });

    // Generate JWT token
    const token = generateToken(user._id);

    // Generate welcome email content
    const emailContent = `
      <h2>Welcome to Fun4Pet, ${user.name}!</h2>
      <p>Your account has been successfully created and you're now part of our pet-loving community!</p>
      
      <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px;">
        <p><strong>Account Details:</strong></p>
        <ul style="margin-left: 20px;">
          <li><strong>Email:</strong> ${user.email}</li>
          ${user.phone ? `<li><strong>Phone:</strong> ${user.phone}</li>` : ""}
          <li><strong>Account Created:</strong> ${new Date().toLocaleDateString()}</li>
        </ul>
      </div>
      
      <p>Here's what you can do next:</p>
      <ul style="margin-left: 20px;">
        <li>Complete your profile</li>
        <li>Browse our products and services</li>
        <li>Book appointments for your pets</li>
      </ul>
      
      <p>If you have any questions, our support team is always happy to help.</p>
      <p>Happy pet parenting!</p>
    `;

    // Send welcome email (don't await to not block response)
    try {
      const emailHtml = await generateEmailHtml({
        customerName: user.name,
        emailContent: emailContent,
        ctaText: "Start Shopping",
        ctaLink: "#", // Replace with actual link
        subject: `Welcome to Fun4Pet, ${user.name}!`,
      });

      await sendEmail({
        to: user.email,
        subject: `Welcome to Fun4Pet, ${user.name}!`,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
      // Continue even if email fails
    }

    // Return success response
    return res.status(201).json(
      new ApiResponse(
        201,
        {
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            address: user.address,
            createdAt: user.createdAt,
          },
          token,
        },
        "Account created successfully"
      )
    );
  } catch (error) {
    console.error("Account creation error:", error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "An error occurred while creating your account. Please try again."
        )
      );
  }
});

// Login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid email or password"));
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid email or password"));
  }

  const token = generateToken(user._id);

  res.json(new ApiResponse(200, { user, token }, "Logged in successfully"));
});

// Logout
export const logout = asyncHandler(async (req, res) => {
  // For JWT, logout is handled on frontend (delete token). Optionally, use a token blacklist.
  res.json(new ApiResponse(200, null, "Logged out successfully"));
});

// Get profile
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json(new ApiResponse(200, user, "Fetched profile"));
});

// Generate OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Forgot Password - Send OTP
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email is required"));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json(new ApiResponse(404, null, "User not found"));
  }

  // Generate OTP and set expiration (5 minutes from now)
  const otp = generateOtp();
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();
  // Generate OTP email content
  const emailContent = `
    <h2>Password Reset Request</h2>
    <p>Hello ${user.name},</p>
    <p>We received a request to reset your Fun4Pet account password.</p>
    
    <div style="margin: 20px 0; text-align: center;">
      <p style="font-size: 14px; color: #666;">Your One-Time Password (OTP):</p>
      <div style="display: inline-block; padding: 15px 25px; background: #f5f5f5; border-radius: 5px; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
        ${otp}
      </div>
      <p style="font-size: 12px; color: #999; margin-top: 10px;">This OTP will expire in 5 minutes</p>
    </div>
    
    <p>For security reasons:</p>
    <ul style="margin-left: 20px;">
      <li>Do not share this OTP with anyone</li>
      <li>Fun4Pet will never ask for your password or OTP</li>
    </ul>
    
    <p>If you didn't request this password reset, please secure your account immediately.</p>
  `;

  // Send OTP email
  try {
    const emailHtml = await generateEmailHtml({
      customerName: user.name,
      emailContent: emailContent,
      subject: "Fun4Pet Password Reset OTP",
    });

    await sendEmail({
      to: user.email,
      subject: "Fun4Pet Password Reset OTP",
      html: emailHtml,
    });
  } catch (emailError) {
    console.error("Failed to send OTP email:", emailError);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to send OTP email"));
  }

  return res.json(
    new ApiResponse(200, { email: user.email }, "OTP sent successfully")
  );
});

// Verify OTP
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email and OTP are required"));
  }

  const user = await User.findOne({
    email,
    otp,
    otpExpires: { $gt: new Date() },
  });

  if (!user) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid or expired OTP"));
  }

  // Generate a temporary token for password reset (valid for 10 minutes)
  const tempToken = jwt.sign(
    { id: user._id, purpose: "password_reset" },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

  // Clear OTP after successful verification
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  return res.json(
    new ApiResponse(200, { tempToken }, "OTP verified successfully")
  );
});

// Reset Password
export const resetPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  if (!newPassword) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "New password is required"));
  }

  // Check password strength (same as registration)
  if (
    newPassword.length < 8 ||
    !/\d/.test(newPassword) ||
    !/[!@#$%^&*]/.test(newPassword)
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Password must be at least 8 characters with 1 number and 1 special character"
        )
      );
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json(new ApiResponse(404, null, "User not found"));
  }

  // If currentPassword is provided (for authenticated users changing password)
  if (currentPassword) {
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Current password is incorrect"));
    }
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return res.json(new ApiResponse(200, null, "Password updated successfully"));
});

// Edit Profile
export const editProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, phone, address } = req.body;

  // Only allow updating name, phone, and address
  const updateFields = {};
  if (name) updateFields.name = name;
  if (phone) updateFields.phone = phone;
  if (address) updateFields.address = address;

  if (Object.keys(updateFields).length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No valid fields to update"));
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true, runValidators: true, select: "-password" }
  );

  if (!user) {
    return res.status(404).json(new ApiResponse(404, null, "User not found"));
  }

  res.json(new ApiResponse(200, user, "Profile updated successfully"));
});
