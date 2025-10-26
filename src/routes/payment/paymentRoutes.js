// routes/paymentRoutes.js
import express from "express";
import { paymentCallback } from "../../controllers/payment/paymentController.js";

const router = express.Router();
// Handle both GET and POST for callback (Easebuzz typically uses GET)
router.get("/callback", paymentCallback);
router.post("/callback", paymentCallback);

export default router;
