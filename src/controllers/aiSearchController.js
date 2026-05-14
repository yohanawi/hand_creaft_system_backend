/**
 * AI Image Search Controller
 *
 * Provides two public-facing capabilities:
 *  1. searchByImage  — user uploads a photo → get visually similar products
 *  2. getIndexStatus — how many products have been AI-indexed (admin info)
 *
 * And two admin-only utilities:
 *  3. indexProduct      — extract + store features for ONE product
 *  4. indexAllProducts  — bulk-index every product that has an image
 */

const fs = require("fs");
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
    serializeAiProduct,
} = require("../utils/aiSearch");

// ─── Config ──────────────────────────────────────────────────────────────────

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

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/ai-search/search
 * Body: multipart/form-data  { image: <file> }
 *
 * Returns top-N visually similar products sorted by cosine similarity.
 */
exports.searchByImage = async (req, res) => {
    try {
        // ── 1. Validate upload ────────────────────────────────────────────────
        if (!req.file) {
            return res.status(400).json({ message: "Please upload an image file." });
        }

        // ── 2. Ask AI service for query-image features ─────────────────────
        let queryFeatures;
        try {
            queryFeatures = await extractProductFeatures(req.file.path);
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
            // Remove the temp upload regardless of outcome
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, () => { });
            }
        }

        // ── 3. Load all indexed products (features included via +features) ──
        const products = await Product.find({
            status: 'active',
            isArchived: { $ne: true },
            featuresIndexed: true,
        })
            .select('+features name slug description price salePrice currency thumbnailImage images category subcategory material color availabilityStatus quantity isFeatured sku tags averageRating reviewCount featuresIndexed featuresImageSignature')
            .populate("category", "name")
            .populate("subcategory", "name")
            .lean();

        const freshProducts = products.filter(hasFreshAiFeatures);

        if (freshProducts.length === 0) {
            const catalog = await getAiCatalogStats();
            return res.json({
                message:
                    "No products are AI-indexed yet. Ask an admin to run the indexing step.",
                catalog,
                results: [],
                total: 0,
            });
        }

        // ── 4. Score every product ────────────────────────────────────────
        const scored = buildVisualMatches(freshProducts, queryFeatures);

        res.json({
            message: `Found ${scored.length} similar product(s).`,
            results: scored,
            total: scored.length,
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

/**
 * POST /api/ai-search/index/:id  (admin)
 * Extract and save AI features for a single product.
 */
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

/**
 * POST /api/ai-search/index-all  (admin)
 * Background-style: streams JSON progress back to the client.
 * Indexes every active product that has an image.
 */
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
            errors: errors.slice(0, 20), // cap error list
        });
    } catch (error) {
        console.error("indexAllProducts error:", error);
        res.status(500).json({ message: "Server error.", error: error.message });
    }
};

/**
 * GET /api/ai-search/index-status  (admin)
 * Returns how many products are indexed vs total.
 */
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
