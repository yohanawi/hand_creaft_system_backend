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

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const Product = require("../models/Product");

// ─── Config ──────────────────────────────────────────────────────────────────
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two numeric arrays.
 * Returns a value in [-1, 1]; higher = more similar.
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    if (vecA.length !== vecB.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
}

/**
 * Send a local file to the Python AI service and get back a feature vector.
 * @param {string} filePath - absolute path to the image on disk
 * @returns {number[]} 1280-dimensional feature vector
 */
async function extractFeaturesFromFile(filePath) {
    const form = new FormData();
    form.append("image", fs.createReadStream(filePath));

    const response = await axios.post(`${AI_SERVICE_URL}/extract`, form, {
        headers: form.getHeaders(),
        timeout: 60000, // 60 s — model cold-start can be slow
    });

    if (!response.data || !response.data.features) {
        throw new Error("AI service returned no features");
    }
    return response.data.features;
}

/**
 * Send an image URL to the Python AI service and get back a feature vector.
 * Used when indexing existing products whose images are already hosted.
 * @param {string} imageUrl
 * @returns {number[]}
 */
async function extractFeaturesFromUrl(imageUrl) {
    const response = await axios.post(
        `${AI_SERVICE_URL}/extract-url`,
        { url: imageUrl },
        {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
        }
    );

    if (!response.data || !response.data.features) {
        throw new Error("AI service returned no features");
    }
    return response.data.features;
}

/**
 * Resolve the best image URL / path for a product.
 * Falls back through: thumbnailImage → first image in images[]
 */
function getProductImageSource(product) {
    if (product.thumbnailImage) return product.thumbnailImage;
    if (Array.isArray(product.images) && product.images.length > 0) {
        return product.images[0];
    }
    return null;
}

/**
 * Decide whether an image source is a remote URL or a local file path.
 */
function isUrl(src) {
    return src.startsWith("http://") || src.startsWith("https://");
}

function normalizeImageSource(src) {
    return String(src || "").trim();
}

function tryResolveUploadPath(src) {
    const normalized = normalizeImageSource(src);
    if (!normalized) return null;

    const uploadsIndex = normalized.toLowerCase().indexOf('/uploads/');
    if (uploadsIndex >= 0) {
        const relativePath = normalized.slice(uploadsIndex + 1).replace(/\//g, path.sep);
        return path.join(process.cwd(), relativePath);
    }

    if (normalized.toLowerCase().startsWith('uploads/')) {
        return path.join(process.cwd(), normalized.replace(/\//g, path.sep));
    }

    return null;
}

function resolveLocalImagePath(src) {
    const normalized = normalizeImageSource(src);
    if (!normalized) {
        throw new Error('Empty image source');
    }

    const uploadPath = tryResolveUploadPath(normalized);
    if (uploadPath) {
        return uploadPath;
    }

    if (path.isAbsolute(normalized)) {
        return normalized;
    }

    return path.join(process.cwd(), normalized.replace(/\//g, path.sep));
}

async function getAiServiceHealth() {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, {
        timeout: 10000,
    });
    return response.data;
}

async function extractProductFeatures(imageSrc) {
    const normalized = normalizeImageSource(imageSrc);
    if (!normalized) {
        throw new Error('Product has no image source');
    }

    if (isUrl(normalized)) {
        const localUploadPath = tryResolveUploadPath(normalized);
        if (localUploadPath && fs.existsSync(localUploadPath)) {
            return extractFeaturesFromFile(localUploadPath);
        }

        return extractFeaturesFromUrl(normalized);
    }

    const absolutePath = resolveLocalImagePath(normalized);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath}`);
    }

    return extractFeaturesFromFile(absolutePath);
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
            queryFeatures = await extractFeaturesFromFile(req.file.path);
        } catch (aiError) {
            // Clean up temp file before returning
            fs.unlink(req.file.path, () => { });
            return res.status(503).json({
                message:
                    "AI service is unavailable. Make sure the Python service is running on port 5001.",
                error: aiError.message,
            });
        } finally {
            // Remove the temp upload regardless of outcome
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, () => { });
            }
        }

        // ── 3. Load all indexed products (features included via +features) ──
        const products = await Product.find({ featuresIndexed: true })
            .select("+features")
            .populate("category", "name")
            .populate("subcategory", "name")
            .lean();

        if (products.length === 0) {
            return res.json({
                message:
                    "No products are AI-indexed yet. Ask an admin to run the indexing step.",
                results: [],
                total: 0,
            });
        }

        // ── 4. Score every product ────────────────────────────────────────
        const LIMIT = 10; // return top 10 matches

        const scored = products
            .map((p) => ({
                product: {
                    _id: p._id,
                    name: p.name,
                    slug: p.slug,
                    price: p.price,
                    salePrice: p.salePrice,
                    currency: p.currency,
                    thumbnailImage: p.thumbnailImage,
                    images: p.images,
                    category: p.category,
                    subcategory: p.subcategory,
                    material: p.material,
                    color: p.color,
                    availabilityStatus: p.availabilityStatus,
                    isFeatured: p.isFeatured,
                },
                score: cosineSimilarity(queryFeatures, p.features),
            }))
            .filter((item) => item.score > 0.3) // discard very low matches
            .sort((a, b) => b.score - a.score)
            .slice(0, LIMIT);

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
        const health = await getAiServiceHealth();
        res.json({
            healthy: true,
            serviceUrl: AI_SERVICE_URL,
            ...health,
        });
    } catch (error) {
        res.status(503).json({
            healthy: false,
            serviceUrl: AI_SERVICE_URL,
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

        const imageSrc = getProductImageSource(product);
        if (!imageSrc) {
            return res
                .status(400)
                .json({ message: "Product has no image to index." });
        }

        const features = await extractProductFeatures(imageSrc);

        product.features = features;
        product.featuresIndexed = true;
        await product.save();

        res.json({
            message: `Product "${product.name}" indexed successfully.`,
            featureSize: features.length,
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
        const products = await Product.find({ status: "active" }).select(
            "+features thumbnailImage images name"
        );

        const total = products.length;
        let indexed = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];

        for (const product of products) {
            const imageSrc = getProductImageSource(product);
            if (!imageSrc) {
                skipped++;
                continue;
            }

            try {
                const features = await extractProductFeatures(imageSrc);

                await Product.findByIdAndUpdate(product._id, {
                    features,
                    featuresIndexed: true,
                });
                indexed++;
            } catch (err) {
                failed++;
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
        const [total, indexed, productsWithImages, samplePending, aiHealth] = await Promise.all([
            Product.countDocuments({ status: "active" }),
            Product.countDocuments({ featuresIndexed: true }),
            Product.countDocuments({
                status: 'active',
                $or: [
                    { thumbnailImage: { $exists: true, $ne: null, $ne: '' } },
                    { 'images.0': { $exists: true } },
                ],
            }),
            Product.find({ status: 'active', featuresIndexed: { $ne: true } })
                .select('name sku thumbnailImage images updatedAt')
                .limit(8)
                .lean(),
            getAiServiceHealth().catch((error) => ({ healthy: false, error: error.message })),
        ]);

        res.json({
            total,
            indexed,
            pending: total - indexed,
            productsWithImages,
            productsMissingImages: Math.max(total - productsWithImages, 0),
            percentComplete: total > 0 ? Math.round((indexed / total) * 100) : 0,
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
