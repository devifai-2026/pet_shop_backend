import mongoose from "mongoose";

// models/Cart.js
const cartItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    quantity: Number,
    selectedVariation: {
      variationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product.variations",
      },
      name: String,
      price: Number,
      image: String,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Cart", cartSchema);
