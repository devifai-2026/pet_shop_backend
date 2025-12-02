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
import { createAddress, deleteAddress, getUserAddresses, updateAddress } from "../../controllers/user/address.controller.js";

const router = express.Router();

router.post("/register", createAccount);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticateUser, getProfile);
router.patch("/edit", authenticateUser, editProfile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", authenticateUser, resetPassword);

router.get("/address", authenticateUser, getUserAddresses); // GET /user/address
router.post("/address", authenticateUser, createAddress); // POST /user/address (create/update)
router.put("/address", authenticateUser, updateAddress); // PUT /user/address (update)
router.delete("/address", authenticateUser, deleteAddress);

export default router;
