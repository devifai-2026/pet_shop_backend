import express from "express";
import {
  createOrUpdateHomeBanner,
  deleteBanner,
  getHomeBanner,
  toggleBannerStatus,
  updateBanner,
} from "../../controllers/banner/homeBanner.controller.js";

const router = express.Router();

// Public route - Get active home banner
router.get("/", getHomeBanner);

// Admin protected routes
router.post("/", createOrUpdateHomeBanner);
router.patch("/:id", updateBanner);
router.patch("/toggle-status", toggleBannerStatus);
router.delete("/:id", deleteBanner);

export default router;
