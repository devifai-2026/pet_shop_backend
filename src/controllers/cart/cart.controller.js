import mongoose from "mongoose";
import Cart from "../../models/cart/cart.model.js";
import Product from "../../models/product/product.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user_id: req.user._id }).populate(
    "items.product_id"
  );
  res.json(new ApiResponse(200, cart || { items: [] }, "Fetched cart"));
});

export const addToCart = asyncHandler(async (req, res) => {
  const { product_id, quantity, variationId } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(product_id) || quantity < 1)
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid product or quantity"));

  const product = await Product.findById(product_id);
  if (!product)
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Product not found"));

  // Variation validation
  let selectedVariation = null;
  if (variationId) {
    if (!mongoose.Types.ObjectId.isValid(variationId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid variation ID"));
    }
    
    const variation = product.variations.find(v => v._id.equals(variationId));
    if (!variation) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Variation not found"));
    }
    
    // Check variation stock
    if (variation.stock < quantity) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Insufficient stock for this variation"));
    }
    
    selectedVariation = {
      variationId: variation._id,
      name: variation.name,
      price: variation.price,
      image: variation.images?.[0] || product.images?.[0] || ""
    };
  } else if (product.hasVariations) {
    // If product has variations but no variation selected
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Please select a variation for this product"));
  } else {
    // Check regular product stock
    if (product.stock < quantity) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Insufficient stock"));
    }
  }

  let cart = await Cart.findOne({ user_id: req.user._id });
  if (!cart) {
    cart = await Cart.create({
      user_id: req.user._id,
      items: [{ product_id, quantity, selectedVariation }],
    });
  } else {
    // Find existing item (matching both product AND variation)
    const item = cart.items.find((i) => {
      if (!i.product_id.equals(product_id)) return false;
      
      // If both have variation, compare variationId
      if (variationId && i.selectedVariation) {
        return i.selectedVariation.variationId.equals(variationId);
      }
      
      // If both don't have variation
      return !variationId && !i.selectedVariation;
    });
    
    if (item) {
      item.quantity += quantity;
    } else {
      cart.items.push({ product_id, quantity, selectedVariation });
    }
    await cart.save();
  }
  
  res.json(new ApiResponse(200, cart, "Added to cart"));
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity, variationId } = req.body;

  // Validate productId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid product ID"));
  }

  // Validate quantity
  if (
    typeof quantity !== "number" ||
    quantity < 1 ||
    !Number.isInteger(quantity)
  ) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Quantity must be a positive integer"));
  }

  // Find user's cart and populate product details
  const cart = await Cart.findOne({ user_id: req.user._id }).populate(
    "items.product_id"
  );
  if (!cart) {
    return res.status(404).json(new ApiResponse(404, null, "Cart not found"));
  }

  // Find item index (considering variation if provided)
  const itemIndex = cart.items.findIndex((item) => {
    if (!item.product_id._id.equals(productId)) return false;
    
    if (variationId) {
      return item.selectedVariation?.variationId?.equals(variationId);
    } else {
      return !item.selectedVariation;
    }
  });

  if (itemIndex === -1) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Product not found in cart"));
  }

  // Check stock before updating
  const product = await Product.findById(productId);
  if (variationId) {
    const variation = product.variations.find(v => v._id.equals(variationId));
    if (variation && variation.stock < quantity) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Insufficient stock for this variation"));
    }
  } else if (product.stock < quantity) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Insufficient stock"));
  }

  // Update quantity
  cart.items[itemIndex].quantity = quantity;

  // Save and repopulate to get fresh data
  await cart.save();
  const updatedCart = await Cart.findOne({ user_id: req.user._id }).populate(
    "items.product_id"
  );

  return res.json(
    new ApiResponse(
      200,
      {
        items: updatedCart.items,
        productId,
        quantity,
      },
      "Cart item quantity updated successfully"
    )
  );
});

export const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { variationId } = req.query;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid product ID"));
  }

  const cart = await Cart.findOne({ user_id: req.user._id }).populate(
    "items.product_id"
  );
  if (!cart) {
    return res.status(404).json(new ApiResponse(404, null, "Cart not found"));
  }

  const initialCount = cart.items.length;
  
  // Filter items considering variation if provided
  cart.items = cart.items.filter((item) => {
    // First check if product matches
    if (!item.product_id._id.equals(productId)) return true;
    
    // If variationId is provided, remove only matching variation
    if (variationId) {
      // Keep item if variation doesn't match
      return !item.selectedVariation?.variationId?.equals(variationId);
    } else {
      // If no variationId provided, remove ALL items of this product
      // (both with and without variations)
      return false; // Remove all matching products
    }
  });

  if (cart.items.length === initialCount) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Product not found in cart"));
  }

  await cart.save();

  // Return the updated cart with populated items
  const updatedCart = await Cart.findOne({ user_id: req.user._id }).populate(
    "items.product_id"
  );

  return res.json(
    new ApiResponse(
      200,
      {
        items: updatedCart.items,
      },
      "Item removed from cart"
    )
  );
});

export const clearCart = asyncHandler(async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user_id: req.user._id },
      { $set: { items: [] } },
      { new: true }
    ).populate("items.product_id");

    if (!cart) {
      return res.status(404).json(new ApiResponse(404, null, "Cart not found"));
    }

    return res.json(
      new ApiResponse(200, {
        items: cart.items || [], // Ensure empty array if null
        message: "Cart cleared successfully",
      })
    );
  } catch (error) {
    console.error("Error clearing cart:", error);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Internal server error while clearing cart")
      );
  }
});
