import mongoose from "mongoose";

const variationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    }, // "5 kg", "2*5kg", "3*5kg"
    price: {
      type: Number,
      required: true,
    },
    discountPrice: {
      type: Number,
    },
    stock: {
      type: Number,
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
  },
  { _id: true }
);

export default variationSchema;
