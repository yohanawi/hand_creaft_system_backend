const fs = require("fs");

const Category = require("../models/Category");
const Product = require("../models/Product");
const {
    AI_SERVICE_URL,
    buildAiServiceFailurePayload,
    cosineSimilarity,
    extractProductFeatures,
    getAiCatalogStats,
    getAiServiceHealth,
    getProductImageSignature,
    getProductImageSource,
    hasFreshAiFeatures,
    indexProductDocument,
    isProductAiEligible,
    markProductAiIndexStale,
    predictImageFromFile,
    serializeAiProduct,
} = require("../utils/aiSearch");

function buildVisualMatches(products, queryFeatures) {
    const sorted = products
        .map((product) => ({
            product: serializeAiProduct(product),
            score: cosineSimilarity(queryFeatures, product.features),
        }))
        .filter((entry) => Number.isFinite(entry.score) && entry.score >= 0.18)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            const rightInStock = right.product.availabilityStatus !== 'out_of_stock' && Number(right.product.quantity || 0) > 0;
            const leftInStock = left.product.availabilityStatus !== 'out_of_stock' && Number(left.product.quantity || 0) > 0;
            const stockDelta = Number(rightInStock) - Number(leftInStock);
            if (stockDelta !== 0) {
                return stockDelta;
            }

            return Number(Boolean(right.product.isFeatured)) - Number(Boolean(left.product.isFeatured));
        });

    return sorted.slice(0, 12);
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePredictionCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const singular = {
        rings: 'ring',
        bracelets: 'bracelet',
        necklaces: 'necklace',
        earrings: 'earring',
        pendants: 'pendant',
        bangles: 'bangle',
    };

    return singular[normalized] || normalized;
}

function getCategoryName(category) {
    if (!category) {
        return '';
    }

    if (typeof category === 'string') {
        return category;
    }

    return category.name || '';
}

function getPrimaryImage(product) {
    return product.thumbnailImage || product.images?.[0] || '';
}

function buildProfessionalMatch(entry) {
    const product = entry.product;
    return {
        product_id: product._id,
        name: product.name,
        category: getCategoryName(product.category),
        similarity: Number(entry.score.toFixed(4)),
        image: getPrimaryImage(product),
        price: typeof product.salePrice === 'number' && product.salePrice < product.price
            ? product.salePrice
            : product.price,
    };
}

function buildProductSummary(entry) {
    const product = entry.product;
    return {
        _id: product._id,
        name: product.name,
        slug: product.slug,
        category: getCategoryName(product.category),
        image: getPrimaryImage(product),
        price: typeof product.salePrice === 'number' && product.salePrice < product.price
            ? product.salePrice
            : product.price,
        currency: product.currency || 'USD',
        similarity: Number(entry.score.toFixed(4)),
        availabilityStatus: product.availabilityStatus,
        quantity: Number(product.quantity || 0),
    };
}

async function findCategoryIdsForPrediction(category) {
    const normalized = normalizePredictionCategory(category);
    if (!normalized) {
        return [];
    }

    const plural = normalized.endsWith('s') ? normalized : `${normalized}s`;
    const categoryRegex = new RegExp(`^(${escapeRegex(normalized)}|${escapeRegex(plural)})$`, 'i');
    const categories = await Category.find({ name: categoryRegex }).select('_id').lean();
    return categories.map((item) => item._id);
}

function buildProductQuery(categoryIds = []) {
    const query = {
        status: 'active',
        isArchived: { $ne: true },
        featuresIndexed: true,
    };

    if (categoryIds.length > 0) {
        query.category = { $in: categoryIds };
    }

    return query;
}

function getIndexedProducts(query) {
    return Product.find(query)
        .select('+features name slug description price salePrice currency thumbnailImage images category subcategory material color availabilityStatus quantity isFeatured sku tags averageRating reviewCount featuresIndexed featuresImageSignature')
        .populate("category", "name")
        .populate("subcategory", "name")
        .lean();
}

async function analyzeUploadedImage(filePath) {
    if (typeof predictImageFromFile === 'function') {
        return predictImageFromFile(filePath);
    }

    const features = await extractProductFeatures(filePath);
    return {
        prediction: null,
        features,
        featureMeta: {
            feature_size: features.length,
            normalized: true,
            model: 'MobileNetV2',
        },
    };
}

exports.searchByImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Please upload an image file." });
        }

        let queryFeatures;
        let prediction = null;
        let featureMeta = null;

        try {
            const aiAnalysis = await analyzeUploadedImage(req.file.path);
            queryFeatures = aiAnalysis.features;
            prediction = aiAnalysis.prediction || null;
            featureMeta = aiAnalysis.featureMeta || {
                feature_size: queryFeatures.length,
                normalized: true,
                model: 'MobileNetV2',
            };
        } catch (aiError) {
            const failure = buildAiServiceFailurePayload(
                aiError,
                'AI service is unavailable. Make sure the Python service is running on port 5001.',
            );

            if (failure.statusCode < 500) {
                return res.status(failure.statusCode).json(failure);
            }

            const [catalog, aiHealth] = await Promise.all([
                getAiCatalogStats().catch(() => ({
                    total: 0,
                    indexed: 0,
                    pending: 0,
                    productsWithImages: 0,
                    productsMissingImages: 0,
                    percentComplete: 0,
                    ready: false,
                })),
                getAiServiceHealth().catch(() => ({ healthy: false, serviceUrl: AI_SERVICE_URL })),
            ]);

            return res.status(503).json({
                ...failure,
                aiService: aiHealth,
                catalog,
            });
        } finally {
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, () => { });
            }
        }

        const categoryIds = prediction?.category
            ? await findCategoryIdsForPrediction(prediction.category)
            : [];
        const categoryFiltered = categoryIds.length > 0;
        let usedGlobalFallback = false;

        let products = await getIndexedProducts(buildProductQuery(categoryIds));
        let freshProducts = products.filter(hasFreshAiFeatures);

        if (categoryFiltered && freshProducts.length === 0) {
            usedGlobalFallback = true;
            products = await getIndexedProducts(buildProductQuery());
            freshProducts = products.filter(hasFreshAiFeatures);
        }

        const features = {
            feature_size: featureMeta?.feature_size || queryFeatures.length,
            normalized: featureMeta?.normalized !== false,
            model: featureMeta?.model,
        };

        if (freshProducts.length === 0) {
            const catalog = await getAiCatalogStats();
            return res.json({
                success: true,
                message: "No products are AI-indexed yet. Ask an admin to run the indexing step.",
                prediction,
                features,
                products: [],
                matches: [],
                catalog,
                results: [],
                total: 0,
                searchStrategy: {
                    mode: 'prediction-first',
                    categoryFiltered,
                    fallbackToGlobal: usedGlobalFallback,
                },
            });
        }

        const scored = buildVisualMatches(freshProducts, queryFeatures);
        const simplifiedProducts = scored.map(buildProductSummary);

        res.json({
            success: true,
            message: `Found ${scored.length} similar product(s).`,
            prediction,
            features,
            products: simplifiedProducts,
            matches: scored.map(buildProfessionalMatch),
            results: scored,
            total: scored.length,
            categoryFilter: {
                predicted: prediction?.category || null,
                applied: categoryFiltered,
                matchedCategoryCount: categoryIds.length,
            },
            searchStrategy: {
                mode: 'prediction-first',
                categoryFiltered,
                fallbackToGlobal: usedGlobalFallback,
            },
        });
    } catch (error) {
        console.error("searchByImage error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
};

exports.getAiHealth = async (req, res) => {
    try {
        const [health, catalog] = await Promise.all([
            getAiServiceHealth(),
            getAiCatalogStats(),
        ]);

        res.json({
            healthy: Boolean(health?.healthy),
            ready: catalog.ready,
            serviceUrl: AI_SERVICE_URL,
            catalog,
            ...health,
        });
    } catch (error) {
        const catalog = await getAiCatalogStats().catch(() => ({
            total: 0,
            indexed: 0,
            pending: 0,
            productsWithImages: 0,
            productsMissingImages: 0,
            percentComplete: 0,
            ready: false,
        }));

        res.status(503).json({
            healthy: false,
            ready: false,
            serviceUrl: AI_SERVICE_URL,
            catalog,
            message: 'AI service is unavailable',
            error: error.message,
        });
    }
};

exports.indexProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).select("+features");
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        if (!getProductImageSource(product)) {
            return res
                .status(400)
                .json({ message: "Product has no image to index." });
        }

        if (!isProductAiEligible(product)) {
            return res.status(400).json({
                message: 'Only active, non-archived products can be indexed.',
            });
        }

        const features = await indexProductDocument(product);

        res.json({
            message: `Product "${product.name}" indexed successfully.`,
            featureSize: features.length,
            imageSignature: getProductImageSignature(product),
        });
    } catch (error) {
        console.error("indexProduct error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
};

exports.indexAllProducts = async (req, res) => {
    try {
        const products = await Product.find({
            status: "active",
            isArchived: { $ne: true },
        }).select(
            "+features thumbnailImage images name status isArchived featuresIndexed featuresImageSignature"
        );

        const total = products.length;
        let indexed = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];

        for (const product of products) {
            const imageSrc = getProductImageSource(product);
            if (!imageSrc) {
                if (markProductAiIndexStale(product)) {
                    await product.save();
                }
                skipped++;
                continue;
            }

            if (hasFreshAiFeatures(product)) {
                skipped++;
                continue;
            }

            try {
                await indexProductDocument(product);
                indexed++;
            } catch (err) {
                failed++;
                console.error(`AI indexing failed for ${product._id} (${product.name}):`, err.message);
                errors.push({ productId: product._id, name: product.name, error: err.message });
            }
        }

        res.json({
            message: "Bulk indexing complete.",
            total,
            indexed,
            skipped,
            failed,
            errors: errors.slice(0, 20),
        });
    } catch (error) {
        console.error("indexAllProducts error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
};

exports.getIndexStatus = async (req, res) => {
    try {
        const [catalog, pendingCandidates, aiHealth] = await Promise.all([
            getAiCatalogStats(),
            Product.find({ status: 'active', isArchived: { $ne: true } })
                .select('+features name sku thumbnailImage images updatedAt featuresIndexed featuresImageSignature')
                .lean(),
            getAiServiceHealth().catch((error) => ({ healthy: false, error: error.message })),
        ]);

        const samplePending = pendingCandidates
            .filter((product) => !hasFreshAiFeatures(product))
            .slice(0, 8)
            .map(({ _id, name, sku, thumbnailImage, images, updatedAt }) => ({
                _id,
                name,
                sku,
                thumbnailImage,
                images,
                updatedAt,
            }));

        res.json({
            total: catalog.total,
            indexed: catalog.indexed,
            pending: catalog.pending,
            productsWithImages: catalog.productsWithImages,
            productsMissingImages: catalog.productsMissingImages,
            percentComplete: catalog.percentComplete,
            ready: catalog.ready,
            aiService: aiHealth?.healthy === false
                ? { healthy: false, error: aiHealth.error, serviceUrl: AI_SERVICE_URL }
                : { healthy: true, serviceUrl: AI_SERVICE_URL, model: aiHealth.model, feature_vector_size: aiHealth.feature_vector_size },
            samplePending,
        });
    } catch (error) {
        console.error("getIndexStatus error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
};
