import HomeCarousel from "../../models/carousel/homeCarousel.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import handleMongoErrors from "../../utils/mongooseError.js";

// @access  Private (Admin)
export const createOrUpdateHomeCarousel = asyncHandler(async (req, res) => {
  const { carouselItems, isActive = true } = req.body;

  // Validate exactly 3 carousel items
  if (!Array.isArray(carouselItems) || carouselItems.length !== 3) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Exactly 3 carousel items are required")
      );
  }

  try {
    // Validate required fields for each item
    const isValid = carouselItems.every(
      (item) => item.imageUrl && item.buttonText && item.buttonLink
    );

    if (!isValid) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Each carousel item must have imageUrl, buttonText and buttonLink"
          )
        );
    }

    // There should be only one carousel configuration
    const existingCarousel = await HomeCarousel.findOne();

    const carouselData = {
      carouselItems,
      isActive,
    };

    let carousel;
    if (existingCarousel) {
      carousel = await HomeCarousel.findByIdAndUpdate(
        existingCarousel._id,
        carouselData,
        { new: true, runValidators: true }
      );
    } else {
      carousel = await HomeCarousel.create(carouselData);
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, carousel, "Home carousel updated successfully")
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Public
export const getHomeCarousel = asyncHandler(async (req, res) => {
  try {
    const carousel = await HomeCarousel.findOne({ isActive: true }).select(
      "-__v -createdAt -updatedAt"
    );

    if (!carousel) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "No active home carousel found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, carousel, "Home carousel retrieved successfully")
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const toggleCarouselStatus = asyncHandler(async (req, res) => {
  try {
    const carousel = await HomeCarousel.findOne();

    if (!carousel) {
      return res
        .status(404)
        .json(
          new ApiResponse(404, null, "No home carousel configuration exists")
        );
    }

    carousel.isActive = !carousel.isActive;
    await carousel.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isActive: carousel.isActive },
          `Home carousel ${
            carousel.isActive ? "activated" : "deactivated"
          } successfully`
        )
      );
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});

// @access  Private (Admin)
export const deleteCarousel = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCarousel = await HomeCarousel.findByIdAndDelete(id);

    if (!deletedCarousel) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Carousel not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Carousel deleted successfully"));
  } catch (error) {
    return handleMongoErrors(error, res);
  }
});
