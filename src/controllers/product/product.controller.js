import mongoose from "mongoose";
import Product from "../../models/product/product.model.js";
import Category from "../../models/productCategory/category.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import SubCategory from "../../models/productCategory/subcategory.model.js";
import ChildSubCategory from "../../models/productCategory/childSubCategory.model.js";
import { checkIfProductsUsedInOrderOrCart } from "../../handler/checkOrder&Cart.js";

const validateCategories = async ({
  category_id,
  subCategory_id,
  childSubCategory_id,
}) => {
  if (!mongoose.Types.ObjectId.isValid(category_id)) {
    throw new ApiResponse(400, null, "Invalid category_id");
  }

  const category = await Category.findById(category_id);
  if (!category) {
    throw new ApiResponse(404, null, "Category not found");
  }

  // Validate subCategory only if provided
  if (subCategory_id) {
    if (!mongoose.Types.ObjectId.isValid(subCategory_id)) {
      throw new ApiResponse(400, null, "Invalid subCategory_id");
    }

    const subCategory = await SubCategory.findById(subCategory_id);
    if (!subCategory) {
      throw new ApiResponse(404, null, "Sub-category not found");
    }

    // Check if subCategory belongs to the category
    if (!subCategory.parentCategory.equals(category._id)) {
      throw new ApiResponse(
        400,
        null,
        "subCategory_id does not belong to the supplied category_id"
      );
    }

    // Validate childSubCategory only if provided
    if (childSubCategory_id) {
      if (!mongoose.Types.ObjectId.isValid(childSubCategory_id)) {
        throw new ApiResponse(400, null, "Invalid childSubCategory_id");
      }

      const childSubCategory = await ChildSubCategory.findById(
        childSubCategory_id
      );
      if (!childSubCategory) {
        throw new ApiResponse(404, null, "Child sub-category not found");
      }

      // Check if childSubCategory belongs to the subCategory
      if (!childSubCategory.parentSubCategory.equals(subCategory._id)) {
        throw new ApiResponse(
          400,
          null,
          "childSubCategory_id does not belong to the supplied subCategory_id"
        );
      }

      // Additional check: childSubCategory should also belong to the same category
      if (!childSubCategory.parentCategory.equals(category._id)) {
        throw new ApiResponse(
          400,
          null,
          "childSubCategory_id does not belong to the supplied category_id"
        );
      }
    }
  } else {
    // If no subCategory is provided, childSubCategory should also not be provided
    if (childSubCategory_id) {
      throw new ApiResponse(
        400,
        null,
        "childSubCategory_id cannot be provided without subCategory_id"
      );
    }
  }

  return true;
};

export const createProductInCategory = asyncHandler(async (req, res) => {
  try {
    // Clean up category fields - set to null if empty strings
    const categoryFields = {
      category_id: req.body.category_id,
      subCategory_id: req.body.subCategory_id || null,
      childSubCategory_id: req.body.childSubCategory_id || null
    };

    // Validate categories
    await validateCategories(categoryFields);

    // Update the request body with cleaned category fields
    req.body.subCategory_id = categoryFields.subCategory_id;
    req.body.childSubCategory_id = categoryFields.childSubCategory_id;

    // Handle variation images if they exist
    if (req.body.variations && req.body.variations.length > 0) {
      req.body.hasVariations = true;
      req.body.price = 0;
      req.body.discountPrice = null;

      // Calculate total stock
      req.body.stock = req.body.variations.reduce((total, variation) => {
        return total + (variation.stock || 0);
      }, 0);

      // Process variation images if they're base64 strings (convert to URLs)
      for (let variation of req.body.variations) {
        if (variation.images && Array.isArray(variation.images)) {
          variation.images = variation.images.filter(img => img); // Remove empty/null images
        }
      }
    } else {
      req.body.hasVariations = false;
    }

    const product = await Product.create(req.body);

    res
      .status(201)
      .json(new ApiResponse(201, product, "Product created successfully"));
  } catch (err) {
    if (err instanceof ApiResponse) {
      return res.status(err.statusCode).json(err);
    }

    console.error("Create Product Error:", err);
    res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to create product"));
  }
});

export const getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { deep } = req.query;

  if (!mongoose.Types.ObjectId.isValid(categoryId))
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid category ID"));

  // Build a list of category IDs to search in
  let categoryIds = [categoryId];

  if (deep === "true") {
    const descendants = await Category.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(categoryId) } },
      {
        $graphLookup: {
          from: "categories", // collection name (lower-case!)
          startWith: "$_id",
          connectFromField: "_id",
          connectToField: "parentCategory",
          as: "descendants",
        },
      },
      { $project: { _id: 0, descendants: "$descendants._id" } },
    ]);

    if (descendants.length) {
      categoryIds = categoryIds.concat(descendants[0].descendants);
    }
  }

  const products = await Product.find({ category_id: { $in: categoryIds } })
    .populate("category_id subCategory_id")
    .lean();

  res.json(new ApiResponse(200, products, "Fetched products"));
});

export const getProductsByCategorySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const category = await Category.findOne({ slug });

  if (!category)
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Category not found"));

  // Re-use the controller above by faking params
  req.params.categoryId = category._id;
  return getProductsByCategory(req, res);
});

export const updateProductInCategory = asyncHandler(async (req, res) => {
  try {
    const { categoryId, productId } = req.params;

    const product = await Product.findOne({
      _id: productId,
      category_id: categoryId,
    });

    if (!product)
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Product not found in this category"));

    if (req.body.category_id || req.body.subCategory_id)
      await validateCategories({
        category_id: req.body.category_id || categoryId,
        subCategory_id: req.body.subCategory_id,
      });

    if (req.body.variations && req.body.variations.length > 0) {
      req.body.hasVariations = true;
      req.body.price = null;
      req.body.discountPrice = null;

      // Calculate total stock
      req.body.stock = req.body.variations.reduce((total, variation) => {
        return total + (variation.stock || 0);
      }, 0);

      // Process variation images
      for (let variation of req.body.variations) {
        if (variation.images && Array.isArray(variation.images)) {
          variation.images = variation.images.filter(img => img); // Remove empty/null images
        }
      }
    }

    const updated = await Product.findByIdAndUpdate(productId, req.body, {
      new: true,
    });

    res.json(new ApiResponse(200, updated, "Product updated successfully"));
  } catch (err) {
    if (err instanceof ApiResponse) return res.status(err.statusCode).json(err);
    console.error("Update Product Error:", err);
    res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to update product"));
  }
});

export const getAllProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 24;
  const skip = (page - 1) * limit;

  const { ObjectId } = mongoose.Types;
  
  // start with base match stage
  const matchStage = { isDeleted: false };

  // Search by product name or description
  if (req.query.search && req.query.search.trim() !== "") {
    const searchRegex = { $regex: req.query.search, $options: "i" };
    matchStage.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { tags: searchRegex },
    ];
  }

  // Category filters
  if (req.query.category && req.query.category.trim() !== "") {
    if (ObjectId.isValid(req.query.category)) {
      matchStage.category_id = new ObjectId(req.query.category);
    } else {
      const category = await Category.findOne({ 
        name: { $regex: req.query.category, $options: "i" } 
      });
      if (category) {
        matchStage.category_id = category._id;
      }
    }
  }

  if (req.query.subCategory_id && req.query.subCategory_id.trim() !== "") {
    if (ObjectId.isValid(req.query.subCategory_id)) {
      matchStage.subCategory_id = new ObjectId(req.query.subCategory_id);
    }
  }

  if (req.query.childSubCategory_id && req.query.childSubCategory_id.trim() !== "") {
    if (ObjectId.isValid(req.query.childSubCategory_id)) {
      matchStage.childSubCategory_id = new ObjectId(req.query.childSubCategory_id);
    }
  }

  // Status filter
  if (req.query.status !== undefined) {
    matchStage.status = req.query.status === "true";
  }

  // Minimum rating filter
  if (req.query.minRating) {
    matchStage.rating = { $gte: Number(req.query.minRating) };
  }

  // Boolean filters
  if (req.query.bestSeller === "true") matchStage.bestSeller = true;
  if (req.query.popular === "true") matchStage.popular = true;
  if (req.query.onSale === "true") matchStage.onSale = true;

  // Array for complex AND conditions (Price, Stock)
  const complexConditions = [];

  // Price range filter
  if (req.query.minPrice || req.query.maxPrice) {
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : 0;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : Infinity;
    
    // For products without variations
    const nonVariationCondition = {
      $and: [
        { hasVariations: false },
        { price: {} }
      ]
    };
    
    if (req.query.minPrice) nonVariationCondition.$and[1].price.$gte = minPrice;
    if (req.query.maxPrice) nonVariationCondition.$and[1].price.$lte = maxPrice;
    
    // For products with variations
    const variationCondition = {
      $and: [
        { hasVariations: true },
        { variations: { $elemMatch: {} } }
      ]
    };
    
    const elemMatchCondition = {};
    if (req.query.minPrice) elemMatchCondition.price = { $gte: minPrice };
    if (req.query.maxPrice) {
      if (elemMatchCondition.price) elemMatchCondition.price.$lte = maxPrice;
      else elemMatchCondition.price = { $lte: maxPrice };
    }
    
    variationCondition.$and[1].variations.$elemMatch = elemMatchCondition;
    
    // Either meet non-variation price OR variation price
    complexConditions.push({ $or: [nonVariationCondition, variationCondition] });
  }

  // Stock status filter
  if (req.query.inStock !== undefined) {
    const inStock = req.query.inStock === "true";
    let stockCondition;
    
    if (inStock) {
      stockCondition = {
        $or: [
          { $and: [{ hasVariations: false }, { stock: { $gt: 0 } }] },
          { $and: [{ hasVariations: true }, { "variations.stock": { $gt: 0 } }] }
        ]
      };
    } else {
      stockCondition = {
        $or: [
          { $and: [{ hasVariations: false }, { stock: { $lte: 0 } }] },
          { $and: [{ hasVariations: true }, { "variations.stock": { $lte: 0 } }] }
        ]
      };
    }
    complexConditions.push(stockCondition);
  }
  
  // Add complex conditions to matchStage
  if (complexConditions.length > 0) {
    matchStage.$and = complexConditions;
  }

  // console.log("Final match stage:", JSON.stringify(matchStage, null, 2));

  // Execute count query first
  const total = await Product.countDocuments(matchStage);

  // Handle sorting
  let aggregatePipeline = [];
  
  // Add match stage
  aggregatePipeline.push({ $match: matchStage });
  
  // Add lookups
  aggregatePipeline.push(
    {
      $lookup: {
        from: "categories",
        localField: "category_id",
        foreignField: "_id",
        as: "category_id"
      }
    },
    {
      $lookup: {
        from: "subcategories",
        localField: "subCategory_id",
        foreignField: "_id",
        as: "subCategory_id"
      }
    },
    {
      $lookup: {
        from: "childsubcategories",
        localField: "childSubCategory_id",
        foreignField: "_id",
        as: "childSubCategory_id"
      }
    },
    { $unwind: { path: "$category_id", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$subCategory_id", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$childSubCategory_id", preserveNullAndEmptyArrays: true } }
  );
  
  // Add computed fields for sorting
  aggregatePipeline.push({
    $addFields: {
      effectivePrice: {
        $cond: {
          if: { 
            $and: [
              { $eq: ["$hasVariations", true] }, 
              { $gt: [{ $size: "$variations" }, 0] }
            ] 
          },
          then: { $min: "$variations.price" },
          else: "$price"
        }
      },
      effectiveRating: { $ifNull: ["$rating", 0] }
    }
  });

  // Apply sorting
  switch (req.query.sort) {
    case "oldest": aggregatePipeline.push({ $sort: { createdAt: 1 } }); break;
    case "price_low": aggregatePipeline.push({ $sort: { effectivePrice: 1 } }); break;
    case "price_high": aggregatePipeline.push({ $sort: { effectivePrice: -1 } }); break;
    case "name_asc": aggregatePipeline.push({ $sort: { name: 1 } }); break;
    case "name_desc": aggregatePipeline.push({ $sort: { name: -1 } }); break;
    case "rating": aggregatePipeline.push({ $sort: { effectiveRating: -1 } }); break;
    default: aggregatePipeline.push({ $sort: { createdAt: -1 } });
  }

  // Add pagination
  aggregatePipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  // Execute aggregate query
  const products = await Product.aggregate(aggregatePipeline);

  res.json(
    new ApiResponse(
      200,
      {
        products,
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
      "Fetched all products"
    )
  );
});


export const getFilteredProducts = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      categorySlug,
      subCategorySlug,
      childSubCategorySlug,
      minPrice,
      maxPrice,
      brand,
      type,
      usage,
      page = 1,
      limit = 24,
      sortBy = "popularity", // Add sortBy parameter
      brands, // Array of brands
      types, // Array of types
      species, // Array of species
    } = req.query;

    const match = { isDeleted: false };

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { "filterAttributes.brand": { $regex: search, $options: "i" } },
        { "filterAttributes.type": { $regex: search, $options: "i" } },
        { "pharmacyDetails.manufacturer": { $regex: search, $options: "i" } },
        { breed: { $regex: search, $options: "i" } },
      ];
    }

    // Resolve category slugs to IDs
    const category = categorySlug
      ? await Category.findOne({ slug: categorySlug, isDeleted: false })
      : null;
    if (category) match.category_id = category._id;

    const subCategory = subCategorySlug
      ? await SubCategory.findOne({ slug: subCategorySlug, isDeleted: false })
      : null;
    if (subCategory) match.subCategory_id = subCategory._id;

    const childSubCategory = childSubCategorySlug
      ? await ChildSubCategory.findOne({
          slug: childSubCategorySlug,
          isDeleted: false,
        })
      : null;
    if (childSubCategory) match.childSubCategory_id = childSubCategory._id;

    // Price filter logic separated
    let priceMatch = {};
    if (minPrice || maxPrice) {
      priceMatch.$or = [
        {
          $and: [{ hasVariations: false }, { price: {} }],
        },
        {
          $and: [{ hasVariations: true }, { "variations.price": {} }],
        },
      ];

      if (minPrice) {
        priceMatch.$or[0].$and[1].price.$gte = Number(minPrice);
        priceMatch.$or[1].$and[1]["variations.price"].$gte = Number(minPrice);
      }
      if (maxPrice) {
        priceMatch.$or[0].$and[1].price.$lte = Number(maxPrice);
        priceMatch.$or[1].$and[1]["variations.price"].$lte = Number(maxPrice);
      }
    }

    // Handle array filters (brands, types, species)
    if (brands) {
      if (typeof brands === "string") {
        match["filterAttributes.brand"] = brands;
      } else if (Array.isArray(brands) && brands.length > 0) {
        match["filterAttributes.brand"] = { $in: brands };
      }
    }

    if (types) {
      if (typeof types === "string") {
        match["filterAttributes.type"] = types;
      } else if (Array.isArray(types) && types.length > 0) {
        match["filterAttributes.type"] = { $in: types };
      }
    }

    if (species) {
      if (typeof species === "string") {
        match["filterAttributes.species"] = species;
      } else if (Array.isArray(species) && species.length > 0) {
        match["filterAttributes.species"] = { $in: species };
      }
    }

    // Handle single value filters (for backward compatibility)
    if (brand) match["filterAttributes.brand"] = brand;
    if (type) match["filterAttributes.type"] = type;
    if (usage) match["filterAttributes.usage"] = usage;

    const skip = (Number(page) - 1) * Number(limit);

    // Sort logic
    let sortStage = { $sort: { createdAt: -1 } }; // Default sort

    if (sortBy === "priceLowToHigh") {
      sortStage = { $sort: { discountPrice: 1 } };
    } else if (sortBy === "priceHighToLow") {
      sortStage = { $sort: { discountPrice: -1 } };
    } else if (sortBy === "new") {
      sortStage = { $sort: { createdAt: -1 } };
    } else if (sortBy === "discount") {
      sortStage = { $sort: { discountPercentage: -1 } };
    } else if (sortBy === "popularity") {
      // You can add popularity logic here (based on sales, views, etc.)
      sortStage = { $sort: { createdAt: -1 } };
    }

    // Aggregation pipeline
    const aggregationPipeline = [
      { $match: match },
      {
        $facet: {
          products: [
            { $match: priceMatch }, 
            sortStage, 
            { $skip: skip }, 
            { $limit: Number(limit) }
          ],

          totalCount: [
            { $match: priceMatch }, 
            { $count: "count" }
          ],

          filterCounts: [
            // No priceMatch here to get global stats for the category
            {
              $group: {
                _id: null,
                brands: { $addToSet: "$filterAttributes.brand" },
                types: { $addToSet: "$filterAttributes.type" },
                usages: { $addToSet: "$filterAttributes.usage" },
                species: { $addToSet: "$filterAttributes.species" },
                minPrice: { $min: "$price" },
                maxPrice: { $max: "$price" },
              },
            },
          ],

          brandBreakdown: [
            { $match: priceMatch },
            {
              $group: {
                _id: "$filterAttributes.brand",
                count: { $sum: 1 },
              },
            },
          ],

          speciesBreakdown: [
            { $match: priceMatch },
            {
              $group: {
                _id: "$filterAttributes.species",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const result = await Product.aggregate(aggregationPipeline);

    const {
      products,
      totalCount,
      filterCounts,
      brandBreakdown,
      speciesBreakdown,
    } = result[0];

    const filters = {
      brands: brandBreakdown.map((b) => ({ name: b._id, count: b.count })),
      species: speciesBreakdown.map((s) => ({ name: s._id, count: s.count })),
      types: filterCounts[0]?.types || [],
      usages: filterCounts[0]?.usages || [],
      price: {
        min: filterCounts[0]?.minPrice || 0,
        max: filterCounts[0]?.maxPrice || 0,
      },
    };

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          products,
          total: totalCount[0]?.count || 0,
          page: Number(page),
          pages: Math.ceil((totalCount[0]?.count || 0) / limit),
          filters,
        },
        "Filtered products with breakdown"
      )
    );
  } catch (error) {
    console.error("Filter API Error:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch products"));
  }
});

export const getProductById = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId))
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid product ID"));

  const product = await Product.findById(productId)
    .populate("category_id subCategory_id childSubCategory_id")
    .populate({
      path: "relatedProducts",
      populate: { path: "category_id subCategory_id childSubCategory_id" },
    })
    .lean();

  if (!product)
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Product not found"));

  res.json(new ApiResponse(200, product, "Fetched product"));
});

// Add this to your product.controller.js
export const getRelatedProducts = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 4; // Default to 4 related products

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid product ID"));
    }

    // First get the current product to determine relation criteria
    const product = await Product.findById(productId).lean();
    if (!product) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Product not found"));
    }

    // Find related products based on:
    // 1. Same category
    // 2. Same subcategory (if exists)
    // 3. Similar tags (if exist)
    // 4. Same filter attributes (like brand, type, etc.)
    const relatedProducts = await Product.find({
      _id: { $ne: product._id }, // Exclude current product
      $or: [
        { category_id: product.category_id },
        { subCategory_id: product.subCategory_id },
        { tags: { $in: product.tags || [] } },
        ...(product.filterAttributes?.brand
          ? [{ "filterAttributes.brand": product.filterAttributes.brand }]
          : []),
      ],
      isDeleted: false,
    })
      .limit(limit)
      .populate("category_id subCategory_id")
      .lean();

    res.json(
      new ApiResponse(
        200,
        { products: relatedProducts },
        "Related products fetched"
      )
    );
  } catch (error) {
    console.error("Get Related Products Error:", error);
    res
      .status(500)
      .json(new ApiResponse(500, null, "Failed to fetch related products"));
  }
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  try {
    // First check if the product is used in any active order or cart
    const { used } = await checkIfProductsUsedInOrderOrCart([productId]);

    if (used) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Cannot delete product as it is being used in active orders or carts"
          )
        );
    }

    const deleted = await Product.findByIdAndDelete(productId);
    if (!deleted) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Product not found"));
    }

    return res.json(new ApiResponse(200, null, "Product deleted successfully"));
  } catch (error) {
    // Handle any potential errors (like invalid ObjectId format)
    if (error instanceof mongoose.Error.CastError) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid product ID format"));
    }
    throw error; // Let asyncHandler handle other errors
  }
});

// Get products by specific flags like bestSeller, onSale, popular
export const getProductsByFlag = asyncHandler(async (req, res) => {
  const { flag } = req.query;
  const validFlags = ["bestSeller", "onSale", "popular", "all"];

  if (!flag || !validFlags.includes(flag)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Invalid or missing flag. Use one of: bestSeller, onSale, popular, all"
        )
      );
  }

  let products;
  if (flag === "all") {
    products = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $sample: { size: 12 } },
    ]);
  } else {
    const filter = {
      [flag]: true,
      isDeleted: false,
    };
    products = await Product.find(filter);
  }

  res.json(new ApiResponse(200, products, `Fetched ${flag} products`));
});
