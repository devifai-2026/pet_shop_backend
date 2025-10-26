import HomeBanner from "../../models/banner/homeBanner.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// @access  Private (Admin)
export const createOrUpdateHomeBanner = asyncHandler(async (req, res) => {
  const {
    headerImages,
    midSectionImage,
    footerImages,
    isActive = true,
  } = req.body;

  // Validate images count
  if (
    !Array.isArray(headerImages) ||
    !midSectionImage ||
    !Array.isArray(footerImages) ||
    headerImages.length !== 3 ||
    footerImages.length !== 2
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Exactly 3 header images, 1 mid-section image, and 2 footer images are required"
        )
      );
  }

  try {
    // Validate image URLs
    const allImages = [...headerImages, midSectionImage, ...footerImages];
    if (allImages.some((img) => !img?.imageUrl)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "All images must have an imageUrl"));
    }

    // There should be only one banner configuration (active or inactive)
    const existingBanner = await HomeBanner.findOne();

    const bannerData = {
      headerImages,
      midSectionImage,
      footerImages,
      isActive,
    };

    let banner;
    if (existingBanner) {
      banner = await HomeBanner.findByIdAndUpdate(
        existingBanner._id,
        bannerData,
        { new: true, runValidators: true }
      );
    } else {
      banner = await HomeBanner.create(bannerData);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, banner, "Home banner updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const updateBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    // Validate the banner exists
    const existingBanner = await HomeBanner.findById(id);
    if (!existingBanner) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Banner not found"));
    }

    // Validate partial updates
    if (updates.headerImages && updates.headerImages.length !== 3) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Header must contain exactly 3 images")
        );
    }

    if (updates.footerImages && updates.footerImages.length !== 2) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Footer must contain exactly 2 images")
        );
    }

    // Validate image URLs if provided
    const allImages = [
      ...(updates.headerImages || []),
      ...(updates.midSectionImage ? [updates.midSectionImage] : []),
      ...(updates.footerImages || []),
    ];

    if (allImages.some((img) => !img?.imageUrl)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "All images must have an imageUrl"));
    }

    // Perform the update
    const updatedBanner = await HomeBanner.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedBanner, "Banner updated successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Public
export const getHomeBanner = asyncHandler(async (req, res) => {
  try {
    const banner = await HomeBanner.findOne({ isActive: true }).select(
      "-__v -createdAt -updatedAt"
    );

    if (!banner) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "No active home banner found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, banner, "Home banner retrieved successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const toggleBannerStatus = asyncHandler(async (req, res) => {
  try {
    const banner = await HomeBanner.findOne();

    if (!banner) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "No home banner configuration exists")
        );
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isActive: banner.isActive },
          `Home banner ${
            banner.isActive ? "activated" : "deactivated"
          } successfully`
        )
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const deleteBanner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const deletedBanner = await HomeBanner.findByIdAndDelete(id);

    if (!deletedBanner) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Banner not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Banner deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
