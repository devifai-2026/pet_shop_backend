import express from "express";
import {
  registerAdmin,
  adminLogin,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  adminLogout,
  forgotPassword,
} from "../../controllers/admin/admin.controller.js";

const router = express.Router();

// Admin Registration (Should be protected by super admin)
router.post("/register", registerAdmin);

// Admin Login
router.post("/login", adminLogin);

// Get Admin Profile
router.get("/profile", getAdminProfile);

// Update Admin Profile
router.put("/profile", updateAdminProfile);

// Change Password
router.put("/change-password", changeAdminPassword);
router.post("/forgot-password", forgotPassword);

// Admin Logout
router.post("/logout", adminLogout);

export default router;
