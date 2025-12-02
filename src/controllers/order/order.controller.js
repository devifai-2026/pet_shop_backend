import mongoose from "mongoose";
import Order from "../../models/order/order.model.js";
import Cart from "../../models/cart/cart.model.js";
import Product from "../../models/product/product.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import handleMongoErrors from "../../utils/mongooseError.js";
import { initiateEasebuzzPayment } from "../../services/paymentService.js";
import sendEmail from "../../services/mailer.js";
import { generateEmailHtml } from "./../../services/templateUtils.js";

const generateTrackingNumber = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

async function generateUniqueTrackingNumber(session) {
  let trackingNumber;
  let isUnique = false;

  while (!isUnique) {
    trackingNumber = generateTrackingNumber();
    const exists = await Order.findOne({ trackingNumber }).session(session);
    if (!exists) isUnique = true;
  }

  return trackingNumber;
}

const generateOrderNumber = async () => {
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ORD-${timestamp}-${randomNum}`;
};

export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { shippingAddress, paymentMethod, couponCode, notes } = req.body;

  // Validate required fields
  if (!shippingAddress || !paymentMethod) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Shipping address and payment method are required"
        )
      );
  }

  // Validate payment method
  if (!["COD", "ONLINE"].includes(paymentMethod)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Invalid payment method. Must be COD or ONLINE"
        )
      );
  }

  // Validate shipping address structure
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
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Missing shipping address fields: ${missingFields.join(", ")}`
        )
      );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Verify cart exists with items
    const cart = await Cart.findOne({ user_id: userId }).session(session);
    if (!cart?.items?.length) {
      await session.abortTransaction();
      return res.status(400).json(new ApiResponse(400, null, "Cart is empty"));
    }

    // 2. Process cart items and check stock
    let totalAmount = 0;
    let taxAmount = 0;
    let shippingFee = 0;
    const orderItems = [];
    const outOfStockItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product_id).session(session);

      if (!product) {
        outOfStockItems.push(item.product_id);
        continue;
      }

      if (product.stock < item.quantity) {
        outOfStockItems.push({
          productId: item.product_id,
          available: product.stock,
          requested: item.quantity,
        });
        continue;
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
      taxAmount += subtotal * 0.1; // 10% tax
    }

    if (outOfStockItems.length > 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            { outOfStockItems },
            "Some items are out of stock or unavailable"
          )
        );
    }

    // 3. Calculate final amounts
    shippingFee = totalAmount < 100 ? 5 : 0;
    totalAmount += taxAmount + shippingFee;

    // For COD orders - create order immediately
    if (paymentMethod === "COD") {
      // Generate unique order identifiers
      const orderNumber = await generateOrderNumber();
      const trackingNumber = await generateUniqueTrackingNumber(session);

      // Create the order document
      const orderDoc = new Order({
        user_id: userId,
        orderNumber,
        orderItems,
        totalAmount,
        taxAmount,
        shippingFee,
        shippingAddress,
        paymentMethod,
        paymentStatus: "Pending",
        orderStatus: "Processing",
        trackingNumber,
        notes,
        couponUsed: couponCode ? { code: couponCode, discount: 10 } : null,
      });

      // Reserve product stock
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(
          item.product_id,
          { $inc: { stock: -item.quantity } },
          { session }
        );
      }

      // Save the order within the transaction
      await orderDoc.save({ session });

      // Clear cart for COD orders
      await Cart.findOneAndUpdate(
        { user_id: userId },
        { $set: { items: [] } },
        { session }
      );

      await session.commitTransaction();

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
        <p>Hello ${req.user.firstName},</p>
        <p>Thank you for your order! Your order has been successfully placed.</p>
        
        <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px;">
          <p><strong>Order Number:</strong> #${orderDoc.orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Payment Method:</strong> Cash on Delivery</p>
          <p><strong>Order Total:</strong> ₹${orderDoc.totalAmount.toFixed(
            2
          )}</p>
          <p><strong>Estimated Delivery:</strong> 3-5 business days</p>
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
        
        <p style="margin-top: 20px;">We'll notify you when your order ships. You can track your order using the tracking number: <strong>${trackingNumber}</strong></p>
        <p>Thank you for shopping with Fun4Pet!</p>
      `;

      const emailHtml = await generateEmailHtml({
        customerName: req.user.firstName,
        emailContent: emailContent,
        subject: `Your Fun4Pet Order #${orderDoc.orderNumber} has been placed`,
      });

      await sendEmail({
        to: req.user.email,
        subject: `Your Fun4Pet Order #${orderDoc.orderNumber} has been placed`,
        html: emailHtml,
      });

      session.endSession(); // session end 
      return res
        .status(201)
        .json(new ApiResponse(201, orderDoc, "Order created successfully"));
    } else {
      // For ONLINE payment - initiate payment flow without creating order
      const paymentResult = await initiateEasebuzzPayment({
        cart,
        user: req.user,
        shippingAddress,
        paymentMethod,
        session,
      });

      if (!paymentResult.success) {
        await session.abortTransaction();
        session.endSession(); // session end 
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              { error: paymentResult.error },
              paymentResult.message
            )
          );
      }

      if (!paymentResult.paymentUrl) {
        await session.abortTransaction();
        session.endSession(); // session end 
        return res
          .status(500)
          .json(new ApiResponse(500, null, "Failed to generate payment URL"));
      }

      await session.commitTransaction();
      session.endSession(); // session end
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            payment_url: paymentResult.paymentUrl,
            temp_order_id: paymentResult.tempOrderNumber,
          },
          "Payment initiated successfully"
        )
      );
    }
  } catch (error) {
    // Error handling
    if (session.transaction.isActive) {
      await session.abortTransaction();
    }
    console.error("Order creation error:", error);
    session.endSession(); 

    if (error.name === "MongoError" && error.code === 11000) {
      return res
        .status(409)
        .json(
          new ApiResponse(
            409,
            null,
            "Duplicate order detected. Please try again."
          )
        );
    }

    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal server error"));
  }
});

export const getMyOrders = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    // Build filter
    const filter = { user_id: req.user._id };

    if (status) {
      filter.orderStatus = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); // Start of day
        filter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // End of day
        filter.createdAt.$lte = end;
      }
    }

    // Pagination options
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
      lean: true,
    };

    // Execute query
    const orders = await Order.paginate(filter, options);

    // Format response
    return res.json(
      new ApiResponse(200, orders, "Fetched your orders successfully")
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return handleMongoErrors(error, res);
  }
});

export const getOrderById = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format"));
    }

    const order = await Order.findOne({
      _id: orderId,
      user_id: req.user._id,
    }).lean();

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    return res.json(
      new ApiResponse(200, order, "Order details fetched successfully")
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, deliveryDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format"));
    }

    const validStatuses = [
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Returned",
    ];
    if (!orderStatus || !validStatuses.includes(orderStatus)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Invalid status. Must be one of: ${validStatuses.join(", ")}`
          )
        );
    }

    const updateData = { orderStatus };
    if (orderStatus === "Shipped" && !deliveryDate) {
      // Default delivery date 3 days after shipping
      updateData.deliveryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    } else if (deliveryDate) {
      updateData.deliveryDate = deliveryDate;
    }

    const order = await Order.findOneAndUpdate({ _id: orderId }, updateData, {
      new: true,
      runValidators: true,
    }).populate("user_id", "email firstName");

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    // Send email notification
    if (order.user_id?.email) {
      let emailContent = `
        <h2>Order Status Update</h2>
        <p>Hello ${order.user_id.firstName},</p>
        <p>The status of your order <strong>#${order.orderNumber}</strong> has been updated to <strong>${orderStatus}</strong>.</p>
      `;

      if (orderStatus === "Shipped" && updateData.deliveryDate) {
        emailContent += `
          <div style="margin: 15px 0; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
            <p><strong>Expected Delivery Date:</strong> ${new Date(
              updateData.deliveryDate
            ).toLocaleDateString()}</p>
            <p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>
          </div>
          <p>You can track your order using our <a href="#" style="color: #0066cc;">order tracking page</a>.</p>
        `;
      } else if (orderStatus === "Delivered") {
        emailContent += `
          <p style="color: #28a745; font-weight: bold;">Your order has been successfully delivered!</p>
          <p>We hope you're enjoying your purchase. If you have any questions, please don't hesitate to contact us.</p>
        `;
      } else if (orderStatus === "Cancelled") {
        emailContent += `
          <p style="color: #dc3545;">Your order has been cancelled.</p>
          <p>If this was unexpected or you'd like to reorder, please visit our store.</p>
        `;
      }

      emailContent += `
        <p>Thank you for shopping with Fun4Pet!</p>
      `;

      const emailHtml = await generateEmailHtml({
        customerName: order.user_id.firstName,
        emailContent: emailContent,
        subject: `Update on Your Order #${order.orderNumber}`,
      });

      await sendEmail({
        to: order.user_id.email,
        subject: `Your Order #${order.orderNumber} Status Update`,
        html: emailHtml,
      });
    }

    return res.json(
      new ApiResponse(200, order, "Order status updated successfully")
    );
  } catch (error) {
    console.log("Error updating order status:", error.message);
    return handleMongoErrors(error, res);
  }
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format"));
    }

    const validStatuses = ["Pending", "Paid", "Failed", "Refunded"];
    if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Invalid status. Must be one of: ${validStatuses.join(", ")}`
          )
        );
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId },
      { paymentStatus },
      { new: true, runValidators: true }
    ).populate("user_id", "email firstName");

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    // Send email notification
    if (order.user_id?.email) {
      let emailContent = `
        <h2>Payment Status Update</h2>
        <p>Hello ${order.user_id.firstName},</p>
        <p>The payment status for your order <strong>#${
          order.orderNumber
        }</strong> has been updated to <strong>${paymentStatus}</strong>.</p>
        <div style="margin: 15px 0; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
          <p><strong>Order Total:</strong> ₹${order.totalAmount.toFixed(2)}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        </div>
      `;

      if (paymentStatus === "Paid") {
        emailContent += `
          <p style="color: #28a745; font-weight: bold;">Thank you for your payment!</p>
          <p>Your order is now being processed. We'll notify you when it ships.</p>
        `;
      } else if (paymentStatus === "Failed") {
        emailContent += `
          <p style="color: #dc3545;">We couldn't process your payment.</p>
          <p>Please update your payment information to complete your order.</p>
        `;
      } else if (paymentStatus === "Refunded") {
        emailContent += `
          <p>Your refund has been processed successfully.</p>
          <p>It may take 3-5 business days for the amount to reflect in your account.</p>
        `;
      }

      emailContent += `<p>Thank you for shopping with Fun4Pet!</p>`;

      const emailHtml = await generateEmailHtml({
        customerName: order.user_id.firstName,
        emailContent: emailContent,
        subject: `Payment Update for Order #${order.orderNumber}`,
      });

      await sendEmail({
        to: order.user_id.email,
        subject: `Payment Update for Order #${order.orderNumber}`,
        html: emailHtml,
      });
    }

    return res.json(
      new ApiResponse(200, order, "Payment status updated successfully")
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const updateTrackingNumber = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format"));
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId, user_id: req.user._id },
      { trackingNumber: generateTrackingNumber() },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    return res.json(
      new ApiResponse(200, order, "Tracking number updated successfully")
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const getOrderByTrackingNumber = asyncHandler(async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber || trackingNumber.length !== 12) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid tracking number format"));
    }

    const order = await Order.findOne({
      trackingNumber,
      user_id: req.user._id,
    }).lean();

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    return res.json(
      new ApiResponse(200, order, "Order details fetched successfully")
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const cancelOrder = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format"));
    }

    if (!reason) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Cancellation reason is required"));
    }

    const order = await Order.findOne({
      _id: orderId,
      user_id: req.user._id,
    });

    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found"));
    }

    // Check if order can be cancelled
    if (!["Processing", "Confirmed", "Shipped"].includes(order.orderStatus)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Order can only be cancelled if it's in Processing, Confirmed or Shipped status"
          )
        );
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Update order status and set cancel reason
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: orderId },
        {
          orderStatus: "Cancelled",
          cancelDetails: {
            reason,
            notes: notes || undefined,
          },
        },
        { new: true, session }
      );

      // 2. Restore product stock
      await Promise.all(
        updatedOrder.orderItems.map(async (item) => {
          await Product.findByIdAndUpdate(
            item.product_id,
            { $inc: { stock: item.quantity } },
            { session }
          );
        })
      );

      // 3. Refund payment if already paid
      if (updatedOrder.paymentStatus === "Paid") {
        // Implement your refund logic here
        // This might involve calling a payment gateway API
        updatedOrder.paymentStatus = "Refunded";
        await updatedOrder.save({ session });
      }

      await session.commitTransaction();

      return res.json(
        new ApiResponse(200, updatedOrder, "Order cancelled successfully")
      );
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

export const getAllOrders = asyncHandler(async (req, res) => {
  try {
    // Admin-only endpoint
    const {
      page = 1,
      limit = 10,
      status,
      userId,
      startDate,
      endDate,
    } = req.query;

    const filter = {};
    if (status) filter.orderStatus = status;
    if (userId) filter.user_id = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      lean: true,
    };

    const orders = await Order.paginate(filter, options);

    return res.json(
      new ApiResponse(200, orders, "Fetched all orders successfully")
    );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
