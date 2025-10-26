import { handleEasebuzzCallback } from "../../services/paymentService.js";
import config from "../../config/easebuzz.js";

// Update the paymentCallback function in paymentController.js
export const paymentCallback = async (req, res) => {
  try {
    console.log("Request Method:", req.method);
    console.log("Request Query:", req.query);
    console.log("Request Body:", req.body);

    // Get callback data from both query and body (depending on method)
    const callbackData = req.method === "GET" ? req.query : req.body;

    console.log("Callback Data to Process:", callbackData);

    // Check if we have any data
    if (!callbackData || Object.keys(callbackData).length === 0) {
      console.error("No callback data received");
      return res.redirect(
        `${config.frontend_url}/order-failed?message=${encodeURIComponent(
          "No payment data received"
        )}`
      );
    }

    const result = await handleEasebuzzCallback(callbackData);

    if (result.success) {
      return res.redirect(result.redirectUrl);
    } else {
      return res.redirect(result.redirectUrl);
    }
  } catch (error) {
    console.error("Payment callback error:", error);
    return res.redirect(
      `${config.frontend_url}/order-failed?message=${encodeURIComponent(
        "Error processing payment"
      )}`
    );
  }
};
