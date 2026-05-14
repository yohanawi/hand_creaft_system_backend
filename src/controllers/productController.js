const Product = require("../models/Product");
const Order = require("../models/Order");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const slugify = require("slugify");
const { createStockMovement, syncAvailabilityStatus } = require('../utils/inventory');
const { logAdminActivity } = require('../utils/activityLogger');

const isAdminActor = (req) => req.user?.role === 'admin';

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

const isSellerActor = (req) => req.user?.role === 'seller';

const getActorShopName = (req) => String(
    req.user?.sellerProfile?.shopName
    || req.user?.name
    || 'HandCraft Seller'
).trim();

const ensureManageableProduct = (req, product) => {
    if (!product) {
        return { error: 'Product not found', status: 404 };
    }

    if (!isSellerActor(req)) {
        return { ok: true };
    }

    if (String(product.seller || '') !== String(req.user?._id || '')) {
        return { error: 'You can only manage your own products', status: 403 };
    }

    return { ok: true };
};

const buildDuplicateProductIdentity = async (product) => {
    const baseName = normalizeOptionalString(product?.name) || 'Product';
    const baseSku = normalizeOptionalString(product?.sku) || `SKU-${String(product?._id || Date.now())}`;

    for (let attempt = 1; attempt < 1000; attempt += 1) {
        const suffix = attempt === 1 ? 'Copy' : `Copy ${attempt}`;
        const name = `${baseName} (${suffix})`;
        const slug = slugify(name, { lower: true, strict: true }) || `product-copy-${Date.now()}-${attempt}`;
        const sku = `${baseSku}-COPY${attempt === 1 ? '' : `-${attempt}`}`;
        const existingProduct = await Product.exists({
            $or: [
                { slug },
                { sku },
            ],
        });

        if (!existingProduct) {
            return { name, slug, sku };
        }
    }

    throw new Error('Unable to generate a unique duplicate product identity');
};

const cloneProductVariants = (variants = []) => variants.map((variant) => ({
    label: normalizeOptionalString(variant?.label),
    size: normalizeOptionalString(variant?.size),
    color: normalizeOptionalString(variant?.color),
    style: normalizeOptionalString(variant?.style),
    sku: normalizeOptionalString(variant?.sku),
    quantity: normalizeNumber(variant?.quantity, 0),
    price: normalizeNumber(variant?.price),
    salePrice: normalizeNumber(variant?.salePrice),
    thumbnailImage: normalizeOptionalString(variant?.thumbnailImage),
    isDefault: Boolean(variant?.isDefault),
}));

const BEST_SELLER_ORDER_STATUSES = [
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
];

const BEST_SELLER_PAYMENT_STATUSES = ['paid', 'cod_due'];

const attachSalesStats = async (products) => {
    const productIds = products.map((product) => product._id);

    if (productIds.length === 0) {
        return [];
    }

    const salesStats = await Order.aggregate([
        {
            $match: {
                status: { $in: BEST_SELLER_ORDER_STATUSES },
                paymentStatus: { $in: BEST_SELLER_PAYMENT_STATUSES },
                'items.product': { $in: productIds },
            },
        },
        { $unwind: '$items' },
        {
            $match: {
                'items.product': { $in: productIds },
            },
        },
        {
            $group: {
                _id: '$items.product',
                soldCount: { $sum: '$items.quantity' },
                orderCount: { $sum: 1 },
                grossRevenue: {
                    $sum: {
                        $multiply: [
                            '$items.quantity',
                            { $ifNull: ['$items.salePrice', '$items.price'] },
                        ],
                    },
                },
            },
        },
    ]);

    const statsMap = new Map(
        salesStats.map((entry) => [String(entry._id), entry])
    );

    return products.map((product) => {
        const stats = statsMap.get(String(product._id));

        return {
            ...product.toObject(),
            soldCount: stats?.soldCount || 0,
            orderCount: stats?.orderCount || 0,
            grossRevenue: stats?.grossRevenue || 0,
        };
    });
};

const attachDiscountStats = (products) => products.map((product) => {
    const baseProduct = product.toObject();
    const regularPrice = Number(baseProduct.price || 0);
    const discountedPrice = Number(baseProduct.salePrice || 0);
    const hasDiscount = discountedPrice > 0 && regularPrice > 0 && discountedPrice < regularPrice;
    const discountAmount = hasDiscount ? regularPrice - discountedPrice : 0;
    const discountPercent = hasDiscount ? Math.round((discountAmount / regularPrice) * 100) : 0;

    return {
        ...baseProduct,
        discountAmount,
        discountPercent,
    };
});

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

exports.getSellerProducts = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 25 } = req.query;
        const query = { seller: req.user._id };

        if (status && ['active', 'inactive', 'archived'].includes(String(status))) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('category', 'name slug')
            .populate('subcategory', 'name slug');

        return res.json({
            products,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)) || 1,
            totalPages: Math.ceil(total / Number(limit)) || 1,
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
            seller: isSellerActor(req) ? req.user._id : req.body.seller || null,
            sellerShopName: isSellerActor(req) ? getActorShopName(req) : String(req.body.sellerShopName || '').trim(),
            subcategory: subcategory || null,
            quantity: typeof quantity === "undefined" ? 0 : quantity,
            description,
            color,
            status,
            isFeatured: isSellerActor(req) ? false : isFeatured,
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

        await logAdminActivity({
            req,
            action: 'create',
            resourceType: 'product',
            resourceId: product._id,
            resourceName: product.name,
            before: null,
            after: product,
        });

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
            onSale,
            sort = 'newest',
            page,
            limit,
            status,
            archived,
            scope,
        } = req.query;

        const adminScope = isAdminActor(req);
        const query = adminScope ? {} : { status: 'active', isArchived: { $ne: true } };
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;
        if (material) query.material = { $regex: material, $options: 'i' };
        if (adminScope && status && ['active', 'inactive', 'archived'].includes(String(status))) {
            query.status = String(status);
        }
        if (adminScope) {
            if (archived === 'only' || query.status === 'archived') {
                query.isArchived = true;
            } else if (archived !== 'include') {
                query.isArchived = { $ne: true };
            }
        }
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
        if (onSale === 'true') {
            query.$and = query.$and || [];
            query.$and.push({ salePrice: { $ne: null } });
            query.$and.push({ $expr: { $lt: ['$salePrice', '$price'] } });
        }

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
            discount_desc: { createdAt: -1 },
            popular: { reviewCount: -1, averageRating: -1 },
        };

        const pageNumber = Number(page) > 0 ? Number(page) : null;
        const limitNumber = Number(limit) > 0 ? Number(limit) : null;

        const total = await Product.countDocuments(query);

        if (sort === 'popular' || sort === 'discount_desc') {
            let matchedProductsQuery = Product.find(query)
                .populate("category", "name slug")
                .populate("subcategory", "name slug");

            if (adminScope) {
                matchedProductsQuery = matchedProductsQuery.populate('seller', 'name email sellerProfile.shopName sellerStatus');
            }

            const matchedProducts = await matchedProductsQuery;

            const rankedProducts = sort === 'popular'
                ? await attachSalesStats(matchedProducts)
                : attachDiscountStats(matchedProducts);

            if (sort === 'popular') {
                rankedProducts.sort((left, right) => (
                    (right.soldCount || 0) - (left.soldCount || 0)
                    || (right.orderCount || 0) - (left.orderCount || 0)
                    || (right.averageRating || 0) - (left.averageRating || 0)
                    || (right.reviewCount || 0) - (left.reviewCount || 0)
                    || new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
                ));
            } else {
                rankedProducts.sort((left, right) => (
                    (right.discountPercent || 0) - (left.discountPercent || 0)
                    || (right.discountAmount || 0) - (left.discountAmount || 0)
                    || (right.averageRating || 0) - (left.averageRating || 0)
                    || (right.reviewCount || 0) - (left.reviewCount || 0)
                    || new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
                ));
            }

            if (pageNumber && limitNumber) {
                const startIndex = (pageNumber - 1) * limitNumber;
                const paginatedProducts = rankedProducts.slice(startIndex, startIndex + limitNumber);

                return res.json({
                    products: paginatedProducts,
                    total,
                    page: pageNumber,
                    pages: Math.ceil(total / limitNumber),
                });
            }

            if (limitNumber) {
                return res.json(rankedProducts.slice(0, limitNumber));
            }

            return res.json(rankedProducts);
        }

        let cursor = Product.find(query)
            .populate("category", "name slug")
            .populate("subcategory", "name slug")
            .sort(sortMap[sort] || sortMap.newest);

        if (adminScope) {
            cursor = cursor.populate('seller', 'name email sellerProfile.shopName sellerStatus');
        }

        if (pageNumber && limitNumber) {
            cursor = cursor.skip((pageNumber - 1) * limitNumber).limit(limitNumber);
        } else if (limitNumber) {
            cursor = cursor.limit(limitNumber);
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

        if (!isAdminActor(req)) {
            query.status = 'active';
            query.isArchived = { $ne: true };
        }

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
            isArchived: { $ne: true },
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
        const ownership = ensureManageableProduct(req, product);
        if (ownership.error) {
            return res.status(ownership.status).json({ message: ownership.error });
        }
        const before = product.toObject();

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
        if (!isSellerActor(req) && String(status) === 'active' && product.isArchived) {
            product.isArchived = false;
            product.archivedAt = null;
        }
        if (!isSellerActor(req) && typeof isFeatured !== "undefined") product.isFeatured = isFeatured;
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
        if (isSellerActor(req)) {
            product.seller = req.user._id;
            product.sellerShopName = getActorShopName(req);
        }

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

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'product',
            resourceId: updated._id,
            resourceName: updated.name,
            before,
            after: updated,
        });

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
        const product = await Product.findById(req.params.id);
        const ownership = ensureManageableProduct(req, product);
        if (ownership.error) {
            return res.status(ownership.status).json({ message: ownership.error });
        }

        if (product.isArchived) {
            return res.json({ message: 'Product is already archived', product });
        }

        const before = product.toObject();
        product.status = 'archived';
        product.isArchived = true;
        product.archivedAt = new Date();
        product.isFeatured = false;
        await product.save();

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'product',
            resourceId: product._id,
            resourceName: product.name,
            before,
            after: product,
        });

        return res.json({ message: "Product archived", product });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.bulkUpdateProductStatus = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids)
            ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        const status = String(req.body.status || '').trim();

        if (ids.length === 0) {
            return res.status(400).json({ message: 'At least one product id is required' });
        }

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const products = await Product.find({ _id: { $in: ids } });
        const foundIds = new Set(products.map((product) => String(product._id)));
        const failed = ids
            .filter((id) => !foundIds.has(id))
            .map((id) => ({ id, reason: 'Product not found' }));
        const before = products.map((product) => ({ _id: product._id, name: product.name, status: product.status }));

        await Promise.all(products.map(async (product) => {
            product.status = status;
            if (status === 'active' && product.isArchived) {
                product.isArchived = false;
                product.archivedAt = null;
            }
            await product.save();
        }));

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'product',
            resourceName: `Bulk product status to ${status}`,
            before,
            after: {
                status,
                updatedIds: products.map((product) => String(product._id)),
                failed,
            },
        });

        return res.json({
            message: `${products.length} product${products.length === 1 ? '' : 's'} updated`,
            summary: {
                requested: ids.length,
                updated: products.length,
                failed,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.bulkUpdateSellerProducts = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids)
            ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        const status = String(req.body.status || '').trim();

        if (ids.length === 0) {
            return res.status(400).json({ message: 'At least one product id is required' });
        }

        if (!['active', 'inactive', 'archived'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const requestedProducts = await Product.find({ _id: { $in: ids } });
        const manageableProducts = requestedProducts.filter(
            (product) => String(product.seller || '') === String(req.user?._id || ''),
        );
        const manageableIds = new Set(manageableProducts.map((product) => String(product._id)));
        const failed = ids
            .filter((id) => !manageableIds.has(id))
            .map((id) => ({ id, reason: 'Product not found or not owned by seller' }));
        const before = manageableProducts.map((product) => ({
            _id: product._id,
            name: product.name,
            status: product.status,
            isArchived: product.isArchived,
        }));

        await Promise.all(manageableProducts.map(async (product) => {
            product.status = status;
            product.isArchived = status === 'archived';
            product.archivedAt = status === 'archived' ? new Date() : null;
            if (status === 'archived') {
                product.isFeatured = false;
            }
            syncAvailabilityStatus(product);
            await product.save();
        }));

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'product',
            resourceName: `Seller bulk product status to ${status}`,
            before,
            after: {
                status,
                updatedIds: manageableProducts.map((product) => String(product._id)),
                failed,
            },
        });

        return res.json({
            message: `${manageableProducts.length} product${manageableProducts.length === 1 ? '' : 's'} updated`,
            summary: {
                requested: ids.length,
                updated: manageableProducts.length,
                failed,
                failedCount: failed.length,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.duplicateSellerProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        const ownership = ensureManageableProduct(req, product);
        if (ownership.error) {
            return res.status(ownership.status).json({ message: ownership.error });
        }

        const duplicateIdentity = await buildDuplicateProductIdentity(product);
        const duplicatedProduct = await Product.create({
            name: duplicateIdentity.name,
            slug: duplicateIdentity.slug,
            thumbnailImage: product.thumbnailImage || null,
            price: product.price,
            salePrice: product.salePrice,
            currency: product.currency || 'USD',
            category: product.category,
            seller: req.user?._id || product.seller || null,
            sellerShopName: getActorShopName(req),
            sellerVisibilityBlocked: Boolean(product.sellerVisibilityBlocked),
            subcategory: product.subcategory || null,
            quantity: Number(product.quantity || 0),
            description: product.description,
            color: product.color,
            variants: cloneProductVariants(product.variants || []),
            status: product.status === 'archived' ? 'inactive' : product.status,
            isArchived: false,
            archivedAt: null,
            isFeatured: false,
            images: normalizeStringArray(product.images),
            weight: product.weight,
            tags: normalizeStringArray(product.tags),
            sku: duplicateIdentity.sku,
            availabilityStatus: product.availabilityStatus,
            material: product.material,
            lowStockThreshold: product.lowStockThreshold,
            deliveryEstimate: product.deliveryEstimate,
            richMedia: product.richMedia,
            policySurfaces: product.policySurfaces,
        });

        syncAvailabilityStatus(duplicatedProduct);
        await duplicatedProduct.save();

        if (Number(duplicatedProduct.quantity || 0) > 0) {
            await createStockMovement({
                product: duplicatedProduct,
                type: 'opening_balance',
                reason: 'Initial stock on product duplication',
                quantityChange: Number(duplicatedProduct.quantity || 0),
                previousQuantity: 0,
                newQuantity: Number(duplicatedProduct.quantity || 0),
                referenceType: 'product',
                referenceId: String(duplicatedProduct._id),
                performedBy: req.user?._id || null,
            });
        }

        await logAdminActivity({
            req,
            action: 'create',
            resourceType: 'product',
            resourceId: duplicatedProduct._id,
            resourceName: duplicatedProduct.name,
            before: {
                sourceProductId: product._id,
                sourceProductName: product.name,
            },
            after: duplicatedProduct,
        });

        return res.status(201).json({
            message: 'Product duplicated successfully',
            product: duplicatedProduct,
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'Duplicate value' });
        }
        return res.status(500).json({ message: error.message });
    }
};
