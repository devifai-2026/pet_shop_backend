import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import Admin from "../../models/admin/admin.model.js";

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
  const admin = await Admin.findById(req.user.id).select("-password");

  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  res.json(new ApiResponse(200, admin, "Admin profile retrieved successfully"));
});

// Update Admin Profile
export const updateAdminProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const adminId = req.user.id;

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
  const adminId = req.user.id;

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

  const admin = await Admin.findById(adminId);
  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
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

// Forgot Password (Reset Password)
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;

  // Validate input
  if (!email || !newPassword) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Email and new password are required"));
  }

  // Check password strength
  if (newPassword.length < 8) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Password must be at least 8 characters")
      );
  }

  // Find admin by email
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(404).json(new ApiResponse(404, null, "Admin not found"));
  }

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update admin's password
    admin.password = hashedPassword;
    await admin.save();

    // Generate new token (optional - if you want to auto-login after password reset)
    const token = generateAdminToken(admin._id);

    // Return success response with token
    return res.json(
      new ApiResponse(
        200,
        { token }, // Include token if you want to auto-login
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

// Admin Logout
export const adminLogout = asyncHandler(async (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  res.json(new ApiResponse(200, null, "Admin logged out successfully"));
});
