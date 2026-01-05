import express from "express";
import {
  registerAdmin,
  adminLogin,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  adminLogout,
  forgotPassword,
  requestPasswordResetOTP,
  verifyOTPAndResetPassword,
  resendPasswordResetOTP,
  validatePasswordResetOTP,
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
router.post('/forgot-password/request-otp', requestPasswordResetOTP);
router.post('/forgot-password/verify-otp', verifyOTPAndResetPassword);
router.post('/forgot-password/resend-otp', resendPasswordResetOTP);
router.post('/forgot-password/validate-otp', validatePasswordResetOTP);
// Admin Logout
router.post("/logout", adminLogout);

export default router;
