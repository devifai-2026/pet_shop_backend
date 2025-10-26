import crypto from "crypto";
import axios from "axios";
import config from "../config/easebuzz.js";
import Order from "../models/order/order.model.js";
import Cart from "../models/cart/cart.model.js";
import Product from "../models/product/product.model.js";
import mongoose from "mongoose";
import sendEmail from "./mailer.js";
import { generateEmailHtml } from "./templateUtils.js";

export const initiateEasebuzzPayment = async ({
  cart,
  user,
  shippingAddress,
  paymentMethod,
  session,
}) => {
  if (!cart || !user || !shippingAddress || !paymentMethod || !session) {
    throw new Error("Missing required parameters");
  }

  try {
    // 1. Verify cart exists with items
    const existingCart = await Cart.findById(cart._id).session(session);
    if (!existingCart?.items?.length) {
      throw new Error("Cart is empty");
    }

    // 2. Validate all required fields
    const requiredAddressFields = [
      "fullName",
      "addressLine1",
      "city",
      "state",
      "postalCode",
    ];
    const missingFields = requiredAddressFields.filter(
      (field) => !shippingAddress[field]
    );
    if (missingFields.length > 0) {
      throw new Error(
        `Missing shipping address fields: ${missingFields.join(", ")}`
      );
    }

    if (!user.email) {
      throw new Error("User email is required");
    }

    // 3. Generate temporary order number for payment reference
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const tempOrderNumber = `TEMP-${timestamp}-${randomNum}`;

    // 4. Calculate total amount
    let totalAmount = 0;
    const productStockChecks = [];

    for (const item of existingCart.items) {
      const product = await Product.findById(item.product_id).session(session);
      if (!product) {
        throw new Error(`Product ${item.product_id} not found`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Product ${item.product_id} is out of stock`);
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      // Prepare stock reservation for later
      productStockChecks.push({
        productId: item.product_id,
        quantity: item.quantity,
      });
    }

    // Add tax and shipping
    const taxAmount = totalAmount * 0.1;
    const shippingFee = totalAmount < 100 ? 5 : 0;
    totalAmount += taxAmount + shippingFee;

    // 5. Reserve product stock temporarily
    for (const item of productStockChecks) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } },
        { session }
      );
    }

    // 6. Prepare payment request - FIXED: Proper UDF2 encoding and phone validation
    const phone = shippingAddress.phone || user.phone || "0000000000";

    // Create address string without special characters that might cause issues
    const addressInfo = Buffer.from(
      JSON.stringify({
        fullName: shippingAddress.fullName,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode,
        userId: user._id.toString(),
      })
    ).toString("base64");

    const paymentParams = {
      key: config.key,
      txnid: tempOrderNumber,
      amount: totalAmount.toFixed(2),
      firstname: user.name || "Customer",
      email: user.email,
      phone: phone,
      productinfo: "Order Payment",
      surl: `http://localhost:8000/api/v1/payment/callback`,
      furl: `http://localhost:8000/api/v1/payment/callback`,
      service_provider: "payu_paisa",
      udf1: user._id.toString(),
      udf2: addressInfo,
      udf3: "",
      udf4: "",
      udf5: "",
      udf6: "",
      udf7: "",
      udf8: "",
      udf9: "",
      udf10: "",
    };

    // console.log("Payment Params:", {
    //   ...paymentParams,
    //   key: "***HIDDEN***",
    // });

    // 7. Generate secure hash - FIXED: Correct hash string format for Easebuzz
    const hashString = [
      paymentParams.key,
      paymentParams.txnid,
      paymentParams.amount,
      paymentParams.productinfo,
      paymentParams.firstname,
      paymentParams.email,
      paymentParams.udf1,
      paymentParams.udf2,
      paymentParams.udf3,
      paymentParams.udf4,
      paymentParams.udf5,
      paymentParams.udf6,
      paymentParams.udf7,
      paymentParams.udf8,
      paymentParams.udf9,
      paymentParams.udf10,
      config.salt,
    ].join("|");

    // console.log("Hash String:", hashString);

    paymentParams.hash = crypto
      .createHash("sha512")
      .update(hashString)
      .digest("hex");

    // console.log("Generated Hash:", paymentParams.hash);

    // 8. Make API request to payment gateway
    const response = await axios.post(
      `${config.base_url}/payment/initiateLink`,
      new URLSearchParams(paymentParams),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        timeout: 15000,
      }
    );

    // console.log("Payment Gateway Response:", response.data);

    if (!response.data || response.data.status !== 1 || !response.data.data) {
      // Restore product stock if payment initiation fails
      for (const item of productStockChecks) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: item.quantity } },
          { session }
        );
      }

      const errorMsg =
        response.data?.error_desc ||
        response.data?.message ||
        "Payment initiation failed";
      throw new Error(errorMsg);
    }

    // Construct the payment URL using the transaction hash
    const paymentUrl = `${config.base_url}/pay/${response.data.data}`;

    // Return payment URL and temporary reference
    return {
      success: true,
      paymentUrl: paymentUrl,
      tempOrderNumber,
      amount: totalAmount,
    };
  } catch (error) {
    console.error("Payment initiation error:", error.message);
    console.error("Full error:", error);

    if (axios.isAxiosError(error)) {
      console.error("Axios error response:", error.response?.data);
      if (error.response) {
        throw new Error(
          `Payment gateway error: ${
            error.response.data?.error_desc ||
            error.response.data?.message ||
            error.response.statusText
          }`
        );
      }
      throw new Error("Payment gateway is not responding");
    }
    throw error;
  }
};

export const handleEasebuzzCallback = async (callbackData) => {
  // console.log("Callback Data Received:", callbackData);

  // Validate required fields
  if (!callbackData.txnid || !callbackData.status || !callbackData.hash) {
    console.error("Missing required callback fields");
    return {
      success: false,
      message: "Invalid callback data",
      redirectUrl: `${
        config.frontend_url
      }/order-failed?message=${encodeURIComponent("Invalid payment callback")}`,
    };
  }

  // FIXED: Correct hash verification format for callback
  const hashString = [
    config.salt,
    callbackData.status,
    callbackData.udf10 || "",
    callbackData.udf9 || "",
    callbackData.udf8 || "",
    callbackData.udf7 || "",
    callbackData.udf6 || "",
    callbackData.udf5 || "",
    callbackData.udf4 || "",
    callbackData.udf3 || "",
    callbackData.udf2 || "",
    callbackData.udf1 || "",
    callbackData.email || "",
    callbackData.firstname || "",
    callbackData.productinfo || "",
    callbackData.amount || "",
    callbackData.txnid || "",
    callbackData.key || "",
  ].join("|");

  // console.log("Callback Hash String:", hashString);

  const generatedHash = crypto
    .createHash("sha512")
    .update(hashString)
    .digest("hex");

  // console.log("Generated Hash:", generatedHash);
  // console.log("Received Hash:", callbackData.hash);

  if (generatedHash !== callbackData.hash) {
    console.error("Hash verification failed");
    return {
      success: false,
      message: "Invalid hash - potential tampering",
      redirectUrl: `${
        config.frontend_url
      }/order-failed?message=${encodeURIComponent(
        "Payment verification failed"
      )}`,
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if this is a temporary order number
    const isTempOrder = callbackData.txnid.startsWith("TEMP-");

    if (callbackData.status === "success") {
      // Payment success - create actual order
      if (isTempOrder) {
        // Find the user's cart
        const cart = await Cart.findOne({
          user_id: callbackData.udf1,
        }).session(session);

        if (!cart) {
          await session.abortTransaction();
          return {
            success: false,
            message: "Cart not found",
            redirectUrl: `${
              config.frontend_url
            }/order-failed?message=${encodeURIComponent("Cart not found")}`,
          };
        }

        // FIXED: Decode base64 encoded address data
        let shippingAddress;
        try {
          const decodedAddress = Buffer.from(
            callbackData.udf2,
            "base64"
          ).toString("utf8");
          shippingAddress = JSON.parse(decodedAddress);
        } catch (error) {
          console.error("Error decoding address data:", error);
          await session.abortTransaction();
          return {
            success: false,
            message: "Invalid address data",
            redirectUrl: `${
              config.frontend_url
            }/order-failed?message=${encodeURIComponent(
              "Invalid address data"
            )}`,
          };
        }

        const user = { _id: callbackData.udf1 };

        // console.log("Callback UDF1 (User ID):", callbackData.udf1);
        // console.log("Callback UDF2 (Decoded Address):", shippingAddress);

        // Use completeOrderAfterPayment to create the order
        const result = await completeOrderAfterPayment(
          callbackData.txnid,
          user,
          cart,
          shippingAddress,
          session
        );

        // Add payment method details
        result.order.paymentMethodDetails = {
          gateway: "Easebuzz",
          transactionId: callbackData.txnid,
          paymentMode: callbackData.mode || "UNKNOWN",
        };
        await result.order.save({ session });

        await session.commitTransaction();
        return {
          success: true,
          order: result.order,
          redirectUrl: `${config.frontend_url}/order-success?orderId=${result.order._id}`,
        };
      } else {
        await session.abortTransaction();
        return {
          success: false,
          message: "Order already exists",
          redirectUrl: `${
            config.frontend_url
          }/order-failed?message=${encodeURIComponent("Order already exists")}`,
        };
      }
    } else {
      // Payment failed - restore product stock
      if (isTempOrder) {
        const cart = await Cart.findOne({
          user_id: callbackData.udf1,
        }).session(session);

        if (cart) {
          for (const item of cart.items) {
            await Product.findByIdAndUpdate(
              item.product_id,
              { $inc: { stock: item.quantity } },
              { session }
            );
          }
        }
      }

      await session.abortTransaction();
      return {
        success: false,
        message: "Payment failed",
        redirectUrl: `${
          config.frontend_url
        }/order-failed?message=${encodeURIComponent(
          `Payment failed: ${callbackData.status}`
        )}`,
      };
    }
  } catch (error) {
    await session.abortTransaction();
    console.error("Payment callback processing error:", error);
    return {
      success: false,
      message: "Error processing payment callback",
      redirectUrl: `${
        config.frontend_url
      }/order-failed?message=${encodeURIComponent("Error processing payment")}`,
    };
  } finally {
    session.endSession();
  }
};

// Add this function in paymentService.js
async function completeOrderAfterPayment(
  tempOrderNumber,
  user,
  cart,
  shippingAddress,
  session
) {
  // 1. Calculate order amounts
  let totalAmount = 0;
  const orderItems = [];

  for (const item of cart.items) {
    const product = await Product.findById(item.product_id).session(session);
    if (!product) {
      throw new Error(`Product ${item.product_id} not found`);
    }

    const { _id, createdAt, updatedAt, __v, ...cleanProduct } =
      product.toObject();
    const subtotal = product.price * item.quantity;

    orderItems.push({
      product_id: item.product_id,
      quantity: item.quantity,
      productSnapshot: cleanProduct,
      price: product.price,
      subtotal,
    });

    totalAmount += subtotal;
  }

  // Add tax and shipping
  const taxAmount = totalAmount * 0.1;
  const shippingFee = totalAmount < 100 ? 5 : 0;
  totalAmount += taxAmount + shippingFee;

  // 2. Generate order number
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;

  // 3. Create the order
  const order = new Order({
    user_id: user._id,
    orderNumber,
    orderItems,
    totalAmount,
    taxAmount,
    shippingFee,
    shippingAddress,
    paymentMethod: "ONLINE",
    paymentStatus: "Paid",
    orderStatus: "Processing",
    trackingNumber: generateTrackingNumber(),
  });

  await order.save({ session });

  // 4. Clear the cart
  await Cart.findOneAndUpdate(
    { user_id: user._id },
    { $set: { items: [] } },
    { session }
  );

  // Send order confirmation email for online payment
  const orderUser = await mongoose
    .model("User")
    .findById(user._id)
    .select("email firstName")
    .lean();

  if (orderUser?.email) {
    // Generate order summary for email
    const orderSummary = orderItems
      .map(
        (item) => `
      <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
        <p style="margin: 5px 0;"><strong>${
          item.productSnapshot.name
        }</strong></p>
        <p style="margin: 5px 0;">Quantity: ${item.quantity}</p>
        <p style="margin: 5px 0;">Price: ₹${item.price.toFixed(2)}</p>
        <p style="margin: 5px 0;">Subtotal: ₹${item.subtotal.toFixed(2)}</p>
      </div>
    `
      )
      .join("");

    // Generate email content using template
    const emailContent = `
      <h2>Order Confirmation</h2>
      <p>Hello ${orderUser.firstName},</p>
      <p>Thank you for your order! Your payment has been received and your order has been confirmed.</p>
      
      <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px;">
        <p><strong>Order Number:</strong> #${order.orderNumber}</p>
        <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Payment Method:</strong> Online Payment (Paid)</p>
        <p><strong>Order Total:</strong> ₹${order.totalAmount.toFixed(2)}</p>
        <p><strong>Estimated Delivery:</strong> 3-5 business days</p>
        <p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>
      </div>
      
      <h3 style="margin-top: 25px;">Order Details</h3>
      ${orderSummary}
      
      <div style="margin-top: 20px;">
        <h3>Shipping Address</h3>
        <p>${shippingAddress.fullName}</p>
        <p>${shippingAddress.addressLine1}</p>
        ${
          shippingAddress.addressLine2
            ? `<p>${shippingAddress.addressLine2}</p>`
            : ""
        }
        <p>${shippingAddress.city}, ${shippingAddress.state} ${
      shippingAddress.postalCode
    }</p>
        <p>Phone: ${shippingAddress.mobileNumber}</p>
      </div>
      
      <p style="margin-top: 20px;">You can track your order using the tracking number above.</p>
      <p>Thank you for shopping with Fun4Pet!</p>
    `;

    const emailHtml = await generateEmailHtml({
      customerName: orderUser.firstName,
      emailContent: emailContent,
      subject: `Your Fun4Pet Order #${order.orderNumber} Confirmation`,
    });

    await sendEmail({
      to: orderUser.email,
      subject: `Your Fun4Pet Order #${order.orderNumber} Confirmation`,
      html: emailHtml,
    });
  }

  return { order };
}

// Add this helper function
function generateTrackingNumber() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
