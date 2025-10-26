import express from "express";
import {
  createOrUpdateHomeCarousel,
  deleteCarousel,
  getHomeCarousel,
  toggleCarouselStatus,
} from "../../controllers/carousel/homeCarousel.controller.js";

const router = express.Router();

// Public route - Get active home carousel
router.get("/", getHomeCarousel);

// Admin protected routes
router.post("/", createOrUpdateHomeCarousel);
router.patch("/toggle-status", toggleCarouselStatus);
router.delete("/:id", deleteCarousel);

export default router;
