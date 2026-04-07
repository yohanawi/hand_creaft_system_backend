const Product = require("../models/Product");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const slugify = require("slugify");
const { createStockMovement, syncAvailabilityStatus } = require('../utils/inventory');

const parseMaybeJson = (value, fallback) => {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return fallback;
    }
};

const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    return [];
};

const normalizeOptionalString = (value) => {
    if (typeof value === 'undefined' || value === null) {
        return '';
    }

    return String(value).trim();
};

const normalizeNumber = (value, fallback = undefined) => {
    if (typeof value === 'undefined' || value === null || value === '') {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeVariants = (value) => {
    const rawVariants = parseMaybeJson(value, Array.isArray(value) ? value : []);
    if (!Array.isArray(rawVariants)) {
        return [];
    }

    return rawVariants
        .map((variant) => {
            const size = normalizeOptionalString(variant?.size);
            const color = normalizeOptionalString(variant?.color);
            const style = normalizeOptionalString(variant?.style);
            const label = normalizeOptionalString(variant?.label) || [size, color, style].filter(Boolean).join(' / ');
            const sku = normalizeOptionalString(variant?.sku);
            const quantity = normalizeNumber(variant?.quantity, 0);
            const price = normalizeNumber(variant?.price);
            const salePrice = normalizeNumber(variant?.salePrice);
            const thumbnailImage = normalizeOptionalString(variant?.thumbnailImage);

            if (!label && !size && !color && !style && !sku && quantity <= 0) {
                return null;
            }

            return {
                ...(variant?._id ? { _id: variant._id } : {}),
                label,
                size,
                color,
                style,
                sku,
                quantity,
                price,
                salePrice,
                thumbnailImage,
                isDefault: Boolean(variant?.isDefault),
            };
        })
        .filter(Boolean);
};

const normalizeDeliveryEstimate = (value) => {
    const rawValue = parseMaybeJson(value, value && typeof value === 'object' ? value : {});
    return {
        minDays: normalizeNumber(rawValue?.minDays, 0),
        maxDays: normalizeNumber(rawValue?.maxDays, 0),
        label: normalizeOptionalString(rawValue?.label),
        shipsFrom: normalizeOptionalString(rawValue?.shipsFrom),
    };
};

const normalizeRichMedia = (value) => {
    const rawValue = parseMaybeJson(value, value && typeof value === 'object' ? value : {});
    return {
        videos: normalizeStringArray(rawValue?.videos),
        view360Images: normalizeStringArray(rawValue?.view360Images),
    };
};

const normalizePolicySurfaces = (value) => {
    const rawValue = parseMaybeJson(value, value && typeof value === 'object' ? value : {});
    return {
        returnPolicy: normalizeOptionalString(rawValue?.returnPolicy),
        warrantyPolicy: normalizeOptionalString(rawValue?.warrantyPolicy),
        shippingPolicy: normalizeOptionalString(rawValue?.shippingPolicy),
    };
};

exports.uploadProductImages = async (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            return res.status(400).json({ message: 'No images uploaded' });
        }

        const paths = files.map((file) => `uploads/${file.filename}`);
        res.status(201).json({
            message: 'Images uploaded successfully',
            paths,
            thumbnailImage: paths[0],
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// CREATE (Admin)
exports.createProduct = async (req, res) => {
    try {
        const {
            name,
            thumbnailImage,
            price,
            salePrice,
            currency,
            category,
            subcategory,
            quantity,
            description,
            color,
            status,
            isFeatured,
            images,
            weight,
            tags,
            sku,
            availabilityStatus,
            material,
            lowStockThreshold,
            variants,
            deliveryEstimate,
            richMedia,
            policySurfaces,
        } = req.body;

        const normalizedVariants = normalizeVariants(variants);

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name is required" });
        }

        if (typeof price === "undefined" || price === null || price === "") {
            return res.status(400).json({ message: "Price is required" });
        }

        if (!category) {
            return res.status(400).json({ message: "Category is required" });
        }

        if (!sku || !String(sku).trim()) {
            return res.status(400).json({ message: "SKU is required" });
        }

        const parentCategory = await Category.findById(category);
        if (!parentCategory) {
            return res.status(400).json({ message: "Category not found" });
        }

        let linkedSubcategory = null;
        if (subcategory) {
            linkedSubcategory = await Subcategory.findById(subcategory);
            if (!linkedSubcategory) {
                return res.status(400).json({ message: "Subcategory not found" });
            }
            if (String(linkedSubcategory.category) !== String(category)) {
                return res
                    .status(400)
                    .json({ message: "Subcategory does not belong to this category" });
            }
        }

        const product = await Product.create({
            name,
            thumbnailImage: thumbnailImage || null,
            price,
            salePrice: typeof salePrice === "undefined" ? undefined : salePrice,
            currency: currency || "USD",
            category,
            subcategory: subcategory || null,
            quantity: typeof quantity === "undefined" ? 0 : quantity,
            description,
            color,
            status,
            isFeatured,
            images: normalizeStringArray(images),
            weight,
            tags: normalizeStringArray(tags),
            sku: String(sku).trim(),
            availabilityStatus,
            material,
            lowStockThreshold: typeof lowStockThreshold === 'undefined' ? undefined : lowStockThreshold,
            variants: normalizedVariants,
            deliveryEstimate: normalizeDeliveryEstimate(deliveryEstimate),
            richMedia: normalizeRichMedia(richMedia),
            policySurfaces: normalizePolicySurfaces(policySurfaces),
        });

        syncAvailabilityStatus(product);
        await product.save();

        if (Number(product.quantity || 0) > 0) {
            await createStockMovement({
                product,
                type: 'opening_balance',
                reason: 'Initial stock on product creation',
                quantityChange: Number(product.quantity || 0),
                previousQuantity: 0,
                newQuantity: Number(product.quantity || 0),
                referenceType: 'product',
                referenceId: String(product._id),
                performedBy: req.user?._id || null,
            });
        }

        return res.status(201).json(product);
    } catch (error) {
        if (error?.code === 11000) {
            if (error?.keyPattern?.sku) {
                return res.status(400).json({ message: "SKU already exists" });
            }
            if (error?.keyPattern?.slug) {
                return res.status(400).json({ message: "Product slug already exists" });
            }
            return res.status(400).json({ message: "Duplicate value" });
        }
        return res.status(500).json({ message: error.message });
    }
};

// GET ALL (Public)
exports.getProducts = async (req, res) => {
    try {
        const {
            search,
            category,
            subcategory,
            minPrice,
            maxPrice,
            material,
            color,
            size,
            style,
            featured,
            inStock,
            sort = 'newest',
            page,
            limit,
        } = req.query;

        const query = {};
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;
        if (material) query.material = { $regex: material, $options: 'i' };
        if (color) {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { color: { $regex: color, $options: 'i' } },
                    { 'variants.color': { $regex: color, $options: 'i' } },
                ],
            });
        }
        if (size) query['variants.size'] = { $regex: size, $options: 'i' };
        if (style) query['variants.style'] = { $regex: style, $options: 'i' };
        if (featured === 'true') query.isFeatured = true;
        if (inStock === 'true') query.quantity = { $gt: 0 };

        if (search) {
            const searchConditions = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $elemMatch: { $regex: search, $options: 'i' } } },
                { sku: { $regex: search, $options: 'i' } },
                { 'variants.sku': { $regex: search, $options: 'i' } },
                { 'variants.label': { $regex: search, $options: 'i' } },
            ];

            if (query.$and) {
                query.$and.push({ $or: searchConditions });
            } else {
                query.$or = searchConditions;
            }
        }

        const numericMinPrice = Number(minPrice);
        const numericMaxPrice = Number(maxPrice);
        if (Number.isFinite(numericMinPrice) || Number.isFinite(numericMaxPrice)) {
            query.price = {};
            if (Number.isFinite(numericMinPrice)) query.price.$gte = numericMinPrice;
            if (Number.isFinite(numericMaxPrice)) query.price.$lte = numericMaxPrice;
        }

        const sortMap = {
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            rating_desc: { averageRating: -1, reviewCount: -1 },
            popular: { reviewCount: -1, averageRating: -1 },
        };

        const pageNumber = Number(page) > 0 ? Number(page) : null;
        const limitNumber = Number(limit) > 0 ? Number(limit) : null;

        const total = await Product.countDocuments(query);
        let cursor = Product.find(query)
            .populate("category", "name slug")
            .populate("subcategory", "name slug")
            .sort(sortMap[sort] || sortMap.newest);

        if (pageNumber && limitNumber) {
            cursor = cursor.skip((pageNumber - 1) * limitNumber).limit(limitNumber);
        }

        const products = await cursor;

        if (pageNumber && limitNumber) {
            return res.json({
                products,
                total,
                page: pageNumber,
                pages: Math.ceil(total / limitNumber),
            });
        }

        return res.json(products);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// GET SINGLE by slug or MongoDB ID (Public)
exports.getProductBySlug = async (req, res) => {
    try {
        const param = req.params.slug;
        // Try by MongoDB ObjectId first, then by slug
        const isObjectId = /^[a-f\d]{24}$/i.test(param);
        const query = isObjectId ? { _id: param } : { slug: param };

        const product = await Product.findOne(query)
            .populate("category", "name slug")
            .populate("subcategory", "name slug");

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const relatedProducts = await Product.find({
            _id: { $ne: product._id },
            category: product.category?._id || product.category,
            status: 'active',
        })
            .sort({ isFeatured: -1, averageRating: -1, createdAt: -1 })
            .limit(4)
            .populate("category", "name slug")
            .populate("subcategory", "name slug");

        return res.json({ ...product.toObject(), relatedProducts });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// UPDATE (Admin)
exports.updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const {
            name,
            thumbnailImage,
            price,
            salePrice,
            currency,
            category,
            subcategory,
            quantity,
            description,
            color,
            status,
            isFeatured,
            images,
            weight,
            tags,
            sku,
            availabilityStatus,
            material,
            stockNote,
            lowStockThreshold,
            variants,
            deliveryEstimate,
            richMedia,
            policySurfaces,
        } = req.body;

        const previousQuantity = Number(product.quantity || 0);

        if (typeof name === "string" && name.trim()) {
            product.name = name;
            product.slug = slugify(name, { lower: true });
        }

        if (typeof thumbnailImage !== "undefined") product.thumbnailImage = thumbnailImage;
        if (typeof price !== "undefined") product.price = price;
        if (typeof salePrice !== "undefined") product.salePrice = salePrice;
        if (typeof currency !== "undefined") product.currency = currency;

        if (typeof category !== "undefined") {
            if (!category) {
                return res.status(400).json({ message: "Category is required" });
            }
            const parentCategory = await Category.findById(category);
            if (!parentCategory) {
                return res.status(400).json({ message: "Category not found" });
            }
            product.category = category;

            if (product.subcategory) {
                const linked = await Subcategory.findById(product.subcategory);
                if (linked && String(linked.category) !== String(category)) {
                    product.subcategory = null;
                }
            }
        }

        if (typeof subcategory !== "undefined") {
            if (!subcategory) {
                product.subcategory = null;
            } else {
                const linkedSubcategory = await Subcategory.findById(subcategory);
                if (!linkedSubcategory) {
                    return res.status(400).json({ message: "Subcategory not found" });
                }
                if (String(linkedSubcategory.category) !== String(product.category)) {
                    return res
                        .status(400)
                        .json({ message: "Subcategory does not belong to this category" });
                }
                product.subcategory = subcategory;
            }
        }

        if (typeof quantity !== "undefined") product.quantity = quantity;
        if (typeof description !== "undefined") product.description = description;
        if (typeof color !== "undefined") product.color = color;
        if (typeof status !== "undefined") product.status = status;
        if (typeof isFeatured !== "undefined") product.isFeatured = isFeatured;
        if (typeof images !== "undefined") product.images = normalizeStringArray(images);
        if (typeof weight !== "undefined") product.weight = weight;
        if (typeof tags !== "undefined") product.tags = normalizeStringArray(tags);
        if (typeof sku !== "undefined") product.sku = String(sku).trim();
        if (typeof availabilityStatus !== "undefined")
            product.availabilityStatus = availabilityStatus;
        if (typeof material !== "undefined") product.material = material;
        if (typeof lowStockThreshold !== 'undefined') product.lowStockThreshold = lowStockThreshold;
        if (typeof variants !== 'undefined') product.variants = normalizeVariants(variants);
        if (typeof deliveryEstimate !== 'undefined') product.deliveryEstimate = normalizeDeliveryEstimate(deliveryEstimate);
        if (typeof richMedia !== 'undefined') product.richMedia = normalizeRichMedia(richMedia);
        if (typeof policySurfaces !== 'undefined') product.policySurfaces = normalizePolicySurfaces(policySurfaces);

        syncAvailabilityStatus(product);

        const updated = await product.save();

        if (typeof quantity !== 'undefined' && Number(updated.quantity || 0) !== previousQuantity) {
            await createStockMovement({
                product: updated,
                type: 'manual_adjustment',
                reason: 'Product quantity updated from product editor',
                note: String(stockNote || '').trim(),
                quantityChange: Number(updated.quantity || 0) - previousQuantity,
                previousQuantity,
                newQuantity: Number(updated.quantity || 0),
                referenceType: 'product',
                referenceId: String(updated._id),
                performedBy: req.user?._id || null,
            });
        }

        return res.json(updated);
    } catch (error) {
        if (error?.code === 11000) {
            if (error?.keyPattern?.sku) {
                return res.status(400).json({ message: "SKU already exists" });
            }
            if (error?.keyPattern?.slug) {
                return res.status(400).json({ message: "Product slug already exists" });
            }
            return res.status(400).json({ message: "Duplicate value" });
        }
        return res.status(500).json({ message: error.message });
    }
};

// DELETE (Admin)
exports.deleteProduct = async (req, res) => {
    try {
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Product not found" });
        }
        return res.json({ message: "Product deleted" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
