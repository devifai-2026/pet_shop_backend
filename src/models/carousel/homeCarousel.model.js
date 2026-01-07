import mongoose from "mongoose";

const homeCarouselSchema = new mongoose.Schema(
  {
    // Carousel Items (3 images with buttons)
    carouselItems: [
      {
        imageUrl: {
          type: String,
          required: true,
        },
        buttonText: {
          type: String,
          // required: true,
        },
        buttonLink: {
          type: String,
          // required: true,
        },
        altText: String,
      },
    ],

    // Active status
    isActive: {
      type: Boolean,
      default: true,
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Ensure arrays maintain their order
    toJSON: { retainKeyOrder: true },
    toObject: { retainKeyOrder: true },
  }
);

// Indexes
homeCarouselSchema.index({ isActive: 1 });
homeCarouselSchema.index({ createdAt: -1 });

// Pre-save hook to update timestamps
homeCarouselSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Validate exactly 3 carousel items
homeCarouselSchema.pre("save", function (next) {
  if (this.carouselItems.length !== 3) {
    throw new Error("Exactly 3 carousel items are required");
  }
  next();
});

const HomeCarousel = mongoose.model("HomeCarousel", homeCarouselSchema);

export default HomeCarousel;
