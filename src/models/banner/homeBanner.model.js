import mongoose from "mongoose";

const homeBannerSchema = new mongoose.Schema(
  {
    // Header Section (3 images)
    headerImages: [
      {
        imageUrl: {
          type: String,
          required: true,
        },
        redirectUrl: String,
        altText: String,
      },
    ],

    // Mid Section (1 image)
    midSectionImage: {
      imageUrl: {
        type: String,
        required: true,
      },
      redirectUrl: String,
      altText: String,
    },

    // Footer Section (2 images)
    footerImages: [
      {
        imageUrl: {
          type: String,
          required: true,
        },
        redirectUrl: String,
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
homeBannerSchema.index({ isActive: 1 });
homeBannerSchema.index({ createdAt: -1 });

// Pre-save hook to update timestamps
homeBannerSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const HomeBanner = mongoose.model("HomeBanner", homeBannerSchema);

export default HomeBanner;
