// user.routes.js
import express from "express";
import {
  createAccount,
  login,
  logout,
  getProfile,
  forgotPassword,
  verifyOtp,
  resetPassword,
  editProfile,
} from "../../controllers/user/user.controller.js";
import { authenticateUser } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", createAccount);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticateUser, getProfile);
router.patch("/edit", authenticateUser, editProfile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", authenticateUser, resetPassword);

export default router;
