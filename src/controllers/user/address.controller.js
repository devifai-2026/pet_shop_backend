import User from "../../models/user/user.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";


// Get all addresses for user
export const getUserAddresses = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("address");
    const addresses = user.address ? [user.address] : [];

    return res.json(
      new ApiResponse(200, { addresses }, "Address fetched successfully")
    );
  } catch (error) {
    console.error("Error fetching address:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch address"));
  }
});

// Create new address 
export const createAddress = asyncHandler(async (req, res) => {
  try {
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
    } = req.body;

    // Validation
    if (
      !fullName ||
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !postalCode
    ) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "All required fields must be filled"));
    }

    // Validate phone number
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Please enter a valid 10-digit phone number"
          )
        );
    }

    // Validate postal code
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(postalCode)) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Please enter a valid 6-digit postal code")
        );
    }

    // Create address object
    const addressData = {
      fullName,
      phone,
      addressLine1,
      addressLine2: addressLine2 || "",
      city,
      state,
      postalCode,
      country: country || "India",
    };

    // Update user with new address
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          address: addressData,
          // Optional: update user name and phone if provided in address
          ...(fullName && { name: fullName }),
          ...(phone && { phone: phone }),
        },
      },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json(new ApiResponse(404, null, "User not found"));
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          user,
          address: user.address,
        },
        "Address saved successfully"
      )
    );
  } catch (error) {
    console.error("Error creating address:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to save address"));
  }
});

// Update address
export const updateAddress = asyncHandler(async (req, res) => {
  try {
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
    } = req.body;

    // Check if user has existing address
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json(new ApiResponse(404, null, "User not found"));
    }

    if (!user.address) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "No address found to update"));
    }

    // Create updated address object (merge with existing)
    const updatedAddress = {
      ...user.address.toObject(),
      fullName: fullName || user.address.fullName,
      phone: phone || user.address.phone,
      addressLine1: addressLine1 || user.address.addressLine1,
      addressLine2: addressLine2 || user.address.addressLine2,
      city: city || user.address.city,
      state: state || user.address.state,
      postalCode: postalCode || user.address.postalCode,
      country: country || user.address.country || "India",
    };

    // Validation for updated fields
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Please enter a valid 10-digit phone number"
          )
        );
    }

    if (postalCode && !/^\d{6}$/.test(postalCode)) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Please enter a valid 6-digit postal code")
        );
    }

    // Update user address
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          address: updatedAddress,
          // Optional: update user name and phone if changed
          ...(fullName && { name: fullName }),
          ...(phone && { phone: phone }),
        },
      },
      { new: true, runValidators: true }
    ).select("-password");

    return res.json(
      new ApiResponse(
        200,
        {
          user: updatedUser,
          address: updatedUser.address,
        },
        "Address updated successfully"
      )
    );
  } catch (error) {
    console.error("Error updating address:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update address"));
  }
});

// Delete address (remove address from user)
export const deleteAddress = asyncHandler(async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { address: "" } },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json(new ApiResponse(404, null, "User not found"));
    }

    return res.json(
      new ApiResponse(200, { user }, "Address deleted successfully")
    );
  } catch (error) {
    console.error("Error deleting address:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to delete address"));
  }
});
