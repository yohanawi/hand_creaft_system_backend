const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const Product = require('../models/Product');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';

function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
        return 0;
    }

    if (vecA.length !== vecB.length) {
        return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let index = 0; index < vecA.length; index += 1) {
        const left = Number(vecA[index] || 0);
        const right = Number(vecB[index] || 0);
        dot += left * right;
        normA += left * left;
        normB += right * right;
    }
 
    if (normA <= 0 || normB <= 0) {
        return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeImageSource(src) {
    return String(src || '').trim();
}

function getProductImageSource(product) {
    const thumbnailImage = normalizeImageSource(product?.thumbnailImage);
    if (thumbnailImage) {
        return thumbnailImage;
    }

    if (Array.isArray(product?.images) && product.images.length > 0) {
        return normalizeImageSource(product.images[0]);
    }

    return '';
}

function getProductImageSignature(product) {
    return getProductImageSource(product);
}

function isProductAiEligible(product) {
    return product?.status === 'active' && product?.isArchived !== true;
}

function isUrl(src) {
    return /^https?:\/\//i.test(normalizeImageSource(src));
}

function tryResolveUploadPath(src) {
    const normalized = normalizeImageSource(src);
    if (!normalized) {
        return null;
    }

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

async function extractFeaturesFromFile(filePath) {
    const form = new FormData();
    form.append('image', fs.createReadStream(filePath));

    const response = await axios.post(`${AI_SERVICE_URL}/extract`, form, {
        headers: form.getHeaders(),
        timeout: 60000,
    });

    if (!response.data?.features) {
        throw new Error('AI service returned no features');
    }

    return response.data.features;
}

async function extractFeaturesFromUrl(imageUrl) {
    const response = await axios.post(
        `${AI_SERVICE_URL}/extract-url`,
        { url: imageUrl },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000,
        },
    );

    if (!response.data?.features) {
        throw new Error('AI service returned no features');
    }

    return response.data.features;
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

async function getAiServiceHealth() {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, {
        timeout: 10000,
    });

    return {
        healthy: response.data?.status === 'healthy',
        ...response.data,
    };
}

function hasFreshAiFeatures(product) {
    const signature = getProductImageSignature(product);
    return Boolean(
        signature
        && product?.featuresIndexed
        && Array.isArray(product?.features)
        && product.features.length > 0
        && product?.featuresImageSignature === signature,
    );
}

function markProductAiIndexStale(product) {
    if (!product) {
        return false;
    }

    const hadStoredIndex = Boolean(
        (Array.isArray(product.features) && product.features.length > 0)
        || product.featuresIndexed
        || product.featuresImageSignature,
    );

    product.features = [];
    product.featuresIndexed = false;
    product.featuresImageSignature = '';

    return hadStoredIndex;
}

function buildAiServiceFailurePayload(error, fallbackMessage = 'AI service is unavailable.') {
    if (axios.isAxiosError(error)) {
        const statusCode = Number(error.response?.status || 0);
        const responseData = error.response?.data || {};
        const detail = typeof responseData?.error === 'string' && responseData.error.trim()
            ? responseData.error.trim()
            : typeof responseData?.message === 'string' && responseData.message.trim()
                ? responseData.message.trim()
                : error.message;

        if (statusCode >= 400 && statusCode < 500) {
            return {
                statusCode,
                message: detail,
                error: detail,
                serviceUrl: AI_SERVICE_URL,
            };
        }
    }

    return {
        statusCode: 503,
        message: fallbackMessage,
        error: error?.message || 'Unknown AI service error',
        serviceUrl: AI_SERVICE_URL,
    };
}

function serializeAiProduct(product) {
    return {
        _id: product._id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        salePrice: product.salePrice,
        currency: product.currency,
        thumbnailImage: product.thumbnailImage,
        images: product.images,
        category: product.category,
        subcategory: product.subcategory,
        material: product.material,
        color: product.color,
        availabilityStatus: product.availabilityStatus,
        quantity: product.quantity,
        isFeatured: product.isFeatured,
        sku: product.sku,
        tags: product.tags,
        averageRating: product.averageRating,
        reviewCount: product.reviewCount,
    };
}

async function getAiCatalogStats() {
    const products = await Product.find({
        status: 'active',
        isArchived: { $ne: true },
    })
        .select('thumbnailImage images featuresIndexed featuresImageSignature')
        .lean();

    const total = products.length;
    let indexed = 0;
    let productsWithImages = 0;

    products.forEach((product) => {
        const signature = getProductImageSignature(product);
        if (signature) {
            productsWithImages += 1;
        }

        if (signature && product.featuresIndexed && product.featuresImageSignature === signature) {
            indexed += 1;
        }
    });

    return {
        total,
        indexed,
        pending: Math.max(total - indexed, 0),
        productsWithImages,
        productsMissingImages: Math.max(total - productsWithImages, 0),
        percentComplete: total > 0 ? Math.round((indexed / total) * 100) : 0,
        ready: indexed > 0,
    };
}

async function clearProductAiIndex(product) {
    markProductAiIndexStale(product);
    await product.save();
}

async function indexProductDocument(product) {
    if (!isProductAiEligible(product)) {
        throw new Error('Only active, non-archived products can be indexed.');
    }

    const imageSignature = getProductImageSignature(product);
    if (!imageSignature) {
        throw new Error('Product has no image to index.');
    }

    const features = await extractProductFeatures(imageSignature);

    product.features = features;
    product.featuresIndexed = true;
    product.featuresImageSignature = imageSignature;
    await product.save();

    return features;
}

async function refreshProductAiIndexById(productId) {
    const product = await Product.findById(productId).select('+features');
    if (!product) {
        return { status: 'missing' };
    }

    if (!isProductAiEligible(product)) {
        if (product.featuresIndexed || product.featuresImageSignature || product.features.length > 0) {
            await clearProductAiIndex(product);
        }

        return { status: 'skipped', reason: 'inactive-product' };
    }

    const imageSignature = getProductImageSignature(product);
    if (!imageSignature) {
        await clearProductAiIndex(product);
        return { status: 'skipped', reason: 'missing-image' };
    }

    if (hasFreshAiFeatures(product)) {
        return { status: 'fresh', featureSize: product.features.length };
    }

    const features = await indexProductDocument(product);
    return {
        status: 'indexed',
        featureSize: features.length,
        imageSignature,
    };
}

function queueProductAiRefresh(productId, reason = 'catalog-update') {
    if (!productId) {
        return;
    }

    setImmediate(async () => {
        try {
            await refreshProductAiIndexById(productId);
        } catch (error) {
            console.error(`AI auto-refresh failed for ${productId} (${reason}):`, error.message);
        }
    });
}

module.exports = {
    AI_SERVICE_URL,
    buildAiServiceFailurePayload,
    clearProductAiIndex,
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
    normalizeImageSource,
    queueProductAiRefresh,
    refreshProductAiIndexById,
    serializeAiProduct,
};