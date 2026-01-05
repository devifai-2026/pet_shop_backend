import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import Admin from "../../models/admin/admin.model.js";
import sendEmail from "../../services/mailer.js";

// OTP Utility Functions
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const isOTPExpired = (expiryDate) => {
  return new Date() > new Date(expiryDate);
};

const generateOTPExpiry = () => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10); // OTP valid for 10 minutes
  return expiry;
};

const validateOTPFormat = (otp) => {
  return /^\d{6}$/.test(otp);
};

// Email Templates
const emailTemplates = {
  otpTemplate: (otpCode, name = "Admin") => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .container { max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .otp-code { 
          font-size: 32px; 
          font-weight: bold; 
          color: #4CAF50; 
          text-align: center;
          letter-spacing: 5px;
          margin: 20px 0;
          padding: 15px;
          background-color: #e8f5e9;
          border-radius: 5px;
        }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        .warning { color: #ff9800; font-style: italic; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Fun4Pet Admin Password Reset</h1>
        </div>
        <div class="content">
          <h3>Hello ${name},</h3>
          <p>You have requested to reset your password. Use the following OTP to complete the process:</p>
          <div class="otp-code">${otpCode}</div>
          <p>This OTP is valid for <strong>10 minutes</strong> and can only be used once.</p>
          <p class="warning">⚠️ Do not share this OTP with anyone.</p>
          <p>If you didn't request this password reset, please ignore this email or contact support.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Fun4Pet. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  passwordResetSuccessTemplate: (name = "Admin") => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .container { max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .success-icon { color: #4CAF50; font-size: 48px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Successful</h1>
        </div>
        <div class="content">
          <div class="success-icon">✓</div>
          <h3>Hello ${name},</h3>
          <p>Your password has been successfully reset.</p>
          <p>If you did not initiate this change, please contact our support team immediately.</p>
          <p>For security reasons, we recommend that you:</p>
          <ul>
            <li>Use a strong, unique password</li>
            <li>Enable two-factor authentication if available</li>
            <li>Regularly update your password</li>
          </ul>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Fun4Pet. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

// Generate JWT token for admin
const generateAdminToken = (adminId) => {
  return jwt.sign({ id: adminId, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

// Admin Registration (Protected route - should only be accessible by super admin)
export const registerAdmin = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Validate input
  if (!name || !email || !password) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Name, email and password are required")
      );
  }

  // Check if email is valid
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Please provide a valid email address"));
  }

  // Check password strength
  if (password.length < 8) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Password must be at least 8 characters")
      );
  }

  // Check if admin already exists
  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    return res
      .status(409)
      .json(new ApiResponse(409, null, "Email already registered"));
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
    });

    // Generate token
    const token = generateAdminToken(admin._id);

    // Return response without password
    const adminData = admin.toObject();
    delete adminData.password;

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          admin: adminData,
          token,
        },
        "Admin account created successfully"
      )
    );
  } catch (error) {
    console.error("Admin registration error:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Error creating admin account"));
  }
});

// Admin Login
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email and password are required"));
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid credentials"));
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid credentials"));
  }

  // Generate token
  const token = generateAdminToken(admin._id);

  // Return response without password
  const adminData = admin.toObject();
  delete adminData.password;

  res.json(
    new ApiResponse(
      200,
      {
        admin: adminData,
        token,
      },
      "Admin login successful"
    )
  );
});

// Get Admin Profile
export const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await Admin.findOne().select("-password");

  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  res.json(new ApiResponse(200, admin, "Admin profile retrieved successfully"));
});

// Update Admin Profile
export const updateAdminProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  const admin = await Admin.findOne();
  const adminId = admin._id;

  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;

  if (Object.keys(updateData).length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No valid fields to update"));
  }

  // Check if email is being updated and if it's already taken
  if (email) {
    const existingAdmin = await Admin.findOne({ email, _id: { $ne: adminId } });
    if (existingAdmin) {
      return res
        .status(409)
        .json(new ApiResponse(409, null, "Email already in use"));
    }
  }

  const updatedAdmin = await Admin.findByIdAndUpdate(adminId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!updatedAdmin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  res.json(
    new ApiResponse(200, updatedAdmin, "Admin profile updated successfully")
  );
});

// Change Admin Password
export const changeAdminPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await Admin.findOne();

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Current and new password are required")
      );
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Password must be at least 8 characters")
      );
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, admin.password);
  if (!isMatch) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Current password is incorrect"));
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  admin.password = hashedPassword;
  await admin.save();

  res.json(new ApiResponse(200, null, "Password changed successfully"));
});

// Step 1: Request OTP for password reset
export const requestPasswordResetOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email is required"));
  }

  // Check if email is valid
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Please provide a valid email address"));
  }

  // Find admin by email
  const admin = await Admin.findOne({ email });
  if (!admin) {
    // Return generic message for security (don't reveal if email exists)
    return res.status(200).json(
      new ApiResponse(
        404,
        null,
        "Admin not found",
      )
    );
  }

  // Check if there's a recent OTP request (prevent spam)
  if (
    admin.resetPasswordOTP?.expiresAt &&
    !isOTPExpired(admin.resetPasswordOTP.expiresAt)
  ) {
    const timeLeft = Math.ceil(
      (new Date(admin.resetPasswordOTP.expiresAt) - new Date()) / 60000
    );
    return res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          `Please wait ${timeLeft} minute(s) before requesting a new OTP`
        )
      );
  }

  try {
    // Generate OTP and expiry
    const otpCode = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Save OTP to admin document
    admin.resetPasswordOTP = {
      code: await bcrypt.hash(otpCode, 10), // Hash OTP for security
      expiresAt: otpExpiry,
      attempts: 0,
    };

    await admin.save();

    // Send OTP via email
    await sendEmail({
      to: email,
      subject: "Password Reset OTP - Fun4Pet Admin",
      html: emailTemplates.otpTemplate(otpCode, admin.name),
    });

    // Return success response (don't send OTP in response)
    return res.json(
      new ApiResponse(
        200,
        {
          email,
          message: "OTP sent successfully",
          expiresIn: "10 minutes",
        },
        "OTP sent to your email"
      )
    );
  } catch (error) {
    console.error("OTP request error:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Error sending OTP"));
  }
});

// Step 2: Verify OTP and reset password
export const verifyOTPAndResetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Validate input
  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Email, OTP, and new password are required")
      );
  }

  // Check password strength
  if (newPassword.length < 8) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Password must be at least 8 characters")
      );
  }

  // Validate OTP format
  if (!validateOTPFormat(otp)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid OTP format. Must be 6 digits"));
  }

  // Find admin by email
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  // Check if OTP exists
  if (!admin.resetPasswordOTP || !admin.resetPasswordOTP.code) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No OTP requested or OTP expired"));
  }

  // Check if OTP is expired
  if (isOTPExpired(admin.resetPasswordOTP.expiresAt)) {
    admin.resetPasswordOTP = undefined;
    await admin.save();
    return res.status(400).json(new ApiResponse(400, null, "OTP has expired"));
  }

  // Check OTP attempts (max 3 attempts)
  if (admin.resetPasswordOTP.attempts >= 3) {
    admin.resetPasswordOTP = undefined;
    await admin.save();
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Maximum OTP attempts exceeded. Please request a new OTP"
        )
      );
  }

  try {
    // Verify OTP
    const isOTPValid = await bcrypt.compare(otp, admin.resetPasswordOTP.code);

    if (!isOTPValid) {
      // Increment failed attempts
      admin.resetPasswordOTP.attempts += 1;
      await admin.save();

      const attemptsLeft = 3 - admin.resetPasswordOTP.attempts;
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Invalid OTP. ${attemptsLeft} attempt(s) remaining`
          )
        );
    }

    // OTP is valid - Reset password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;

    // Clear OTP after successful use
    admin.resetPasswordOTP = undefined;

    await admin.save();

    // Send success email
    await sendEmail({
      to: email,
      subject: "Password Reset Successful - Fun4Pet Admin",
      html: emailTemplates.passwordResetSuccessTemplate(admin.name),
    });

    // Generate new token for auto-login
    const token = generateAdminToken(admin._id);

    return res.json(
      new ApiResponse(
        200,
        {
          token,
          email: admin.email,
          name: admin.name,
        },
        "Password reset successfully"
      )
    );
  } catch (error) {
    console.error("Password reset error:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Error resetting password"));
  }
});

// Resend OTP
export const resendPasswordResetOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email is required"));
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    // Return generic success message for security
    return res.json(
      new ApiResponse(
        200,
        {
          email,
          message: "If this email is registered, you will receive an OTP",
        },
        "OTP sent successfully"
      )
    );
  }

  // Check if previous OTP exists and is still valid
  if (
    admin.resetPasswordOTP?.expiresAt &&
    !isOTPExpired(admin.resetPasswordOTP.expiresAt)
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Previous OTP is still valid. Please check your email."
        )
      );
  }

  // Use the same function to generate and send new OTP
  req.body = { email };
  return requestPasswordResetOTP(req, res);
});

// Keep old forgotPassword for backward compatibility (optional)
export const forgotPassword = asyncHandler(async (req, res) => {
  // Redirect to OTP request
  return res
    .status(400)
    .json(
      new ApiResponse(
        400,
        null,
        "Please use the OTP-based password reset. Use /request-otp first."
      )
    );
});

// Validate OTP (without resetting password - for frontend validation)
export const validatePasswordResetOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email and OTP are required"));
  }

  // Validate OTP format
  if (!validateOTPFormat(otp)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid OTP format. Must be 6 digits"));
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  // Check if OTP exists
  if (!admin.resetPasswordOTP || !admin.resetPasswordOTP.code) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No OTP requested or OTP expired"));
  }

  // Check if OTP is expired
  if (isOTPExpired(admin.resetPasswordOTP.expiresAt)) {
    admin.resetPasswordOTP = undefined;
    await admin.save();
    return res.status(400).json(new ApiResponse(400, null, "OTP has expired"));
  }

  // Check OTP attempts
  if (admin.resetPasswordOTP.attempts >= 3) {
    admin.resetPasswordOTP = undefined;
    await admin.save();
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Maximum OTP attempts exceeded"));
  }

  // Verify OTP
  const isOTPValid = await bcrypt.compare(otp, admin.resetPasswordOTP.code);

  if (!isOTPValid) {
    // Increment failed attempts
    admin.resetPasswordOTP.attempts += 1;
    await admin.save();

    const attemptsLeft = 3 - admin.resetPasswordOTP.attempts;
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Invalid OTP. ${attemptsLeft} attempt(s) remaining`
        )
      );
  }

  // OTP is valid
  return res.json(
    new ApiResponse(
      200,
      {
        email,
        message: "OTP is valid. You can now reset your password.",
      },
      "OTP validated successfully"
    )
  );
});

// Admin Logout
export const adminLogout = asyncHandler(async (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  res.json(new ApiResponse(200, null, "Admin logged out successfully"));
});
