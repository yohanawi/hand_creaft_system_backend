const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

const Product = require('../src/models/Product');
const {
    buildAiServiceFailurePayload,
    cosineSimilarity,
    getProductImageSource,
    getProductImageSignature,
    hasFreshAiFeatures,
    isProductAiEligible,
    markProductAiIndexStale,
} = require('../src/utils/aiSearch');

const AI_SERVICE_URL = 'http://localhost:5001';

function createResponseCapture() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function createQuery(result) {
    const query = {
        select() {
            return query;
        },
        populate() {
            return query;
        },
        lean() {
            return Promise.resolve(result);
        },
        exec() {
            return Promise.resolve(result);
        },
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
        catch(reject) {
            return Promise.resolve(result).catch(reject);
        },
    };

    return query;
}

function restoreModuleCache(modulePath, originalEntry) {
    if (originalEntry) {
        require.cache[modulePath] = originalEntry;
        return;
    }

    delete require.cache[modulePath];
}

async function withMockedAiController({ productMock, utilsMock, unlinkMock }, run) {
    const controllerPath = require.resolve('../src/controllers/aiSearchController');
    const productPath = require.resolve('../src/models/Product');
    const utilsPath = require.resolve('../src/utils/aiSearch');

    const originalController = require.cache[controllerPath];
    const originalProduct = require.cache[productPath];
    const originalUtils = require.cache[utilsPath];
    const originalUnlink = fs.unlink;

    const baseUtils = {
        AI_SERVICE_URL,
        buildAiServiceFailurePayload: () => ({
            statusCode: 503,
            message: 'AI service is unavailable.',
        }),
        cosineSimilarity: () => 0,
        extractProductFeatures: async () => {
            throw new Error('extractProductFeatures was not mocked');
        },
        getAiCatalogStats: async () => ({
            total: 0,
            indexed: 0,
            pending: 0,
            productsWithImages: 0,
            productsMissingImages: 0,
            percentComplete: 0,
            ready: false,
        }),
        getAiServiceHealth: async () => ({
            healthy: true,
            model: 'MobileNetV2',
            feature_vector_size: 1280,
        }),
        getProductImageSignature: (product) => product.thumbnailImage || product.images?.[0] || '',
        getProductImageSource: (product) => product.thumbnailImage || product.images?.[0] || '',
        hasFreshAiFeatures: () => false,
        indexProductDocument: async () => [0.1, 0.2, 0.3],
        isProductAiEligible: () => true,
        markProductAiIndexStale: () => false,
        serializeAiProduct: (product) => ({ ...product }),
    };

    delete require.cache[controllerPath];
    require.cache[productPath] = {
        id: productPath,
        filename: productPath,
        loaded: true,
        exports: productMock,
    };
    require.cache[utilsPath] = {
        id: utilsPath,
        filename: utilsPath,
        loaded: true,
        exports: { ...baseUtils, ...utilsMock },
    };

    if (unlinkMock) {
        fs.unlink = unlinkMock;
    }

    try {
        const controller = require(controllerPath);
        return await run(controller);
    } finally {
        fs.unlink = originalUnlink;
        delete require.cache[controllerPath];
        restoreModuleCache(productPath, originalProduct);
        restoreModuleCache(utilsPath, originalUtils);
        restoreModuleCache(controllerPath, originalController);
    }
}

async function runProductSavePreHooks(product) {
    await Product.schema.s.hooks.execPre('save', product, []);
}

test('getProductImageSource prefers thumbnail image', () => {
    const product = {
        thumbnailImage: 'uploads/thumb.jpg',
        images: ['uploads/fallback.jpg'],
    };

    assert.equal(getProductImageSource(product), 'uploads/thumb.jpg');
    assert.equal(getProductImageSignature(product), 'uploads/thumb.jpg');
});

test('hasFreshAiFeatures requires matching signature and stored features', () => {
    const freshProduct = {
        thumbnailImage: 'uploads/ring.jpg',
        featuresIndexed: true,
        featuresImageSignature: 'uploads/ring.jpg',
        features: [0.2, 0.4, 0.6],
    };

    const staleProduct = {
        thumbnailImage: 'uploads/new-ring.jpg',
        featuresIndexed: true,
        featuresImageSignature: 'uploads/old-ring.jpg',
        features: [0.2, 0.4, 0.6],
    };

    assert.equal(hasFreshAiFeatures(freshProduct), true);
    assert.equal(hasFreshAiFeatures(staleProduct), false);
});

test('cosineSimilarity returns 0 for invalid vectors and 1 for identical vectors', () => {
    assert.equal(cosineSimilarity([], [1, 2, 3]), 0);
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

test('markProductAiIndexStale clears stored features and signature state', () => {
    const product = {
        features: [0.4, 0.5],
        featuresIndexed: true,
        featuresImageSignature: 'uploads/ring.jpg',
    };

    const hadIndex = markProductAiIndexStale(product);

    assert.equal(hadIndex, true);
    assert.deepEqual(product.features, []);
    assert.equal(product.featuresIndexed, false);
    assert.equal(product.featuresImageSignature, '');
});

test('isProductAiEligible only allows active non-archived products', () => {
    assert.equal(isProductAiEligible({ status: 'active', isArchived: false }), true);
    assert.equal(isProductAiEligible({ status: 'inactive', isArchived: false }), false);
    assert.equal(isProductAiEligible({ status: 'active', isArchived: true }), false);
});

test('buildAiServiceFailurePayload preserves AI validation errors', () => {
    const failure = buildAiServiceFailurePayload({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
            status: 400,
            data: {
                error: 'Image exceeds maximum size of 8388608 bytes',
            },
        },
    });

    assert.equal(failure.statusCode, 400);
    assert.equal(failure.message, 'Image exceeds maximum size of 8388608 bytes');
});

test('buildAiServiceFailurePayload maps network failures to service unavailable', () => {
    const failure = buildAiServiceFailurePayload({
        isAxiosError: true,
        message: 'connect ECONNREFUSED 127.0.0.1:5001',
    });

    assert.equal(failure.statusCode, 503);
    assert.match(failure.message, /AI service is unavailable/i);
});

test('product pre-save hook clears stale AI data when the primary image changes', async () => {
    const product = Product.hydrate({
        _id: new mongoose.Types.ObjectId(),
        name: 'Hook Test Pendant',
        sku: 'HOOK-001',
        price: 129,
        category: new mongoose.Types.ObjectId(),
        status: 'active',
        isArchived: false,
        thumbnailImage: 'uploads/old-pendant.jpg',
        images: ['uploads/old-gallery.jpg'],
        features: [0.2, 0.4, 0.6],
        featuresIndexed: true,
        featuresImageSignature: 'uploads/old-pendant.jpg',
    });

    product.thumbnailImage = 'uploads/new-pendant.jpg';

    await runProductSavePreHooks(product);

    assert.deepEqual(product.features, []);
    assert.equal(product.featuresIndexed, false);
    assert.equal(product.featuresImageSignature, '');
    assert.equal(product.$locals.aiShouldRefresh, true);
    assert.equal(product.$locals.aiRefreshReason, 'image-updated');
});

test('searchByImage ranks fresh products, applies tie-breakers, and caps results at 12', { concurrency: false }, async () => {
    const unlinkCalls = [];
    const products = [
        {
            _id: 'featured-top',
            name: 'Featured Ring',
            sku: 'FEATURED-TOP',
            features: [0.95],
            fresh: true,
            quantity: 2,
            availabilityStatus: 'in_stock',
            isFeatured: true,
            thumbnailImage: 'uploads/featured-top.jpg',
        },
        {
            _id: 'instock-second',
            name: 'In Stock Bracelet',
            sku: 'INSTOCK-SECOND',
            features: [0.95],
            fresh: true,
            quantity: 4,
            availabilityStatus: 'in_stock',
            isFeatured: false,
            thumbnailImage: 'uploads/instock-second.jpg',
        },
        {
            _id: 'out-of-stock-third',
            name: 'Out Of Stock Necklace',
            sku: 'OUT-OF-STOCK-THIRD',
            features: [0.95],
            fresh: true,
            quantity: 0,
            availabilityStatus: 'out_of_stock',
            isFeatured: true,
            thumbnailImage: 'uploads/out-of-stock-third.jpg',
        },
        ...Array.from({ length: 10 }, (_, index) => ({
            _id: `candidate-${index}`,
            name: `Candidate ${index}`,
            sku: `SKU-${index}`,
            features: [0.7 - index * 0.02],
            fresh: true,
            quantity: 1,
            availabilityStatus: 'in_stock',
            isFeatured: false,
            thumbnailImage: `uploads/candidate-${index}.jpg`,
        })),
    ];

    await withMockedAiController(
        {
            productMock: {
                find(filters) {
                    assert.deepEqual(filters, {
                        status: 'active',
                        isArchived: { $ne: true },
                        featuresIndexed: true,
                    });
                    return createQuery(products);
                },
            },
            utilsMock: {
                extractProductFeatures: async () => [1, 0, 0],
                cosineSimilarity: (_queryFeatures, productFeatures) => productFeatures[0],
                hasFreshAiFeatures: (product) => product.fresh === true,
                serializeAiProduct: (product) => ({
                    _id: product._id,
                    name: product.name,
                    sku: product.sku,
                    quantity: product.quantity,
                    availabilityStatus: product.availabilityStatus,
                    isFeatured: product.isFeatured,
                }),
            },
            unlinkMock: (filePath, callback) => {
                unlinkCalls.push(filePath);
                callback();
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.searchByImage({ file: { path: 'uploads/tmp-query.jpg' } }, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.total, 12);
            assert.deepEqual(
                res.body.results.slice(0, 3).map((entry) => entry.product.sku),
                ['FEATURED-TOP', 'INSTOCK-SECOND', 'OUT-OF-STOCK-THIRD'],
            );
            assert.equal(res.body.results[11].product.sku, 'SKU-8');
            assert.deepEqual(unlinkCalls, ['uploads/tmp-query.jpg']);
        },
    );
});

test('searchByImage passes through AI validation failures as client errors', { concurrency: false }, async () => {
    const unlinkCalls = [];

    await withMockedAiController(
        {
            productMock: {
                find() {
                    throw new Error('Product.find should not run for validation failures');
                },
            },
            utilsMock: {
                extractProductFeatures: async () => {
                    throw new Error('invalid image');
                },
                buildAiServiceFailurePayload: () => ({
                    statusCode: 400,
                    message: 'Provided file is not a valid image',
                }),
            },
            unlinkMock: (filePath, callback) => {
                unlinkCalls.push(filePath);
                callback();
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.searchByImage({ file: { path: 'uploads/tmp-invalid.jpg' } }, res);

            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, {
                statusCode: 400,
                message: 'Provided file is not a valid image',
            });
            assert.deepEqual(unlinkCalls, ['uploads/tmp-invalid.jpg']);
        },
    );
});

test('searchByImage returns AI service diagnostics when extraction fails server-side', { concurrency: false }, async () => {
    await withMockedAiController(
        {
            productMock: {
                find() {
                    throw new Error('Product.find should not run for service failures');
                },
            },
            utilsMock: {
                extractProductFeatures: async () => {
                    throw new Error('service unavailable');
                },
                buildAiServiceFailurePayload: () => ({
                    statusCode: 503,
                    message: 'AI service is unavailable. Make sure the Python service is running on port 5001.',
                }),
                getAiCatalogStats: async () => ({
                    total: 21,
                    indexed: 13,
                    pending: 8,
                    productsWithImages: 18,
                    productsMissingImages: 3,
                    percentComplete: 61.9,
                    ready: false,
                }),
                getAiServiceHealth: async () => {
                    throw new Error('socket hang up');
                },
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.searchByImage({ file: { path: 'uploads/tmp-down.jpg' } }, res);

            assert.equal(res.statusCode, 503);
            assert.equal(res.body.message, 'AI service is unavailable. Make sure the Python service is running on port 5001.');
            assert.deepEqual(res.body.catalog, {
                total: 21,
                indexed: 13,
                pending: 8,
                productsWithImages: 18,
                productsMissingImages: 3,
                percentComplete: 61.9,
                ready: false,
            });
            assert.deepEqual(res.body.aiService, {
                healthy: false,
                serviceUrl: AI_SERVICE_URL,
            });
        },
    );
});

test('getAiHealth reports catalog readiness and service details', { concurrency: false }, async () => {
    await withMockedAiController(
        {
            productMock: {},
            utilsMock: {
                getAiCatalogStats: async () => ({
                    total: 30,
                    indexed: 27,
                    pending: 3,
                    productsWithImages: 28,
                    productsMissingImages: 2,
                    percentComplete: 90,
                    ready: true,
                }),
                getAiServiceHealth: async () => ({
                    healthy: true,
                    model: 'MobileNetV2',
                    feature_vector_size: 1280,
                    normalized_embeddings: true,
                }),
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.getAiHealth({}, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.healthy, true);
            assert.equal(res.body.ready, true);
            assert.equal(res.body.serviceUrl, AI_SERVICE_URL);
            assert.equal(res.body.catalog.indexed, 27);
            assert.equal(res.body.model, 'MobileNetV2');
        },
    );
});

test('getAiHealth falls back to 503 with catalog stats when the AI service check fails', { concurrency: false }, async () => {
    await withMockedAiController(
        {
            productMock: {},
            utilsMock: {
                getAiCatalogStats: async () => ({
                    total: 12,
                    indexed: 0,
                    pending: 12,
                    productsWithImages: 10,
                    productsMissingImages: 2,
                    percentComplete: 0,
                    ready: false,
                }),
                getAiServiceHealth: async () => {
                    throw new Error('connect ECONNREFUSED');
                },
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.getAiHealth({}, res);

            assert.equal(res.statusCode, 503);
            assert.equal(res.body.healthy, false);
            assert.equal(res.body.ready, false);
            assert.equal(res.body.catalog.pending, 12);
            assert.match(res.body.error, /ECONNREFUSED/);
        },
    );
});

test('indexProduct rejects products without any indexable image', { concurrency: false }, async () => {
    await withMockedAiController(
        {
            productMock: {
                findById(id) {
                    assert.equal(id, 'product-no-image');
                    return createQuery({ _id: id, name: 'No Image Product' });
                },
            },
            utilsMock: {
                getProductImageSource: () => '',
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.indexProduct({ params: { id: 'product-no-image' } }, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.body.message, 'Product has no image to index.');
        },
    );
});

test('indexProduct rejects inactive or archived products', { concurrency: false }, async () => {
    await withMockedAiController(
        {
            productMock: {
                findById() {
                    return createQuery({ _id: 'inactive-product', name: 'Inactive Product' });
                },
            },
            utilsMock: {
                getProductImageSource: () => 'uploads/inactive-product.jpg',
                isProductAiEligible: () => false,
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.indexProduct({ params: { id: 'inactive-product' } }, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.body.message, 'Only active, non-archived products can be indexed.');
        },
    );
});

test('indexProduct returns feature size and current image signature after a successful index', { concurrency: false }, async () => {
    const product = {
        _id: 'success-product',
        name: 'Success Product',
        thumbnailImage: 'uploads/success-product.jpg',
    };

    await withMockedAiController(
        {
            productMock: {
                findById() {
                    return createQuery(product);
                },
            },
            utilsMock: {
                getProductImageSource: () => 'uploads/success-product.jpg',
                getProductImageSignature: () => 'uploads/success-product.jpg',
                indexProductDocument: async (doc) => {
                    assert.equal(doc, product);
                    return new Array(1280).fill(0.1);
                },
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.indexProduct({ params: { id: 'success-product' } }, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.featureSize, 1280);
            assert.equal(res.body.imageSignature, 'uploads/success-product.jpg');
        },
    );
});

test('indexAllProducts reports indexed, skipped, failed, and stale-image cleanup counts', { concurrency: false }, async () => {
    const noImageProduct = {
        _id: 'missing-image',
        name: 'Missing Image Product',
        saveCalls: 0,
        async save() {
            this.saveCalls += 1;
        },
    };
    const freshProduct = {
        _id: 'fresh-product',
        name: 'Fresh Product',
        thumbnailImage: 'uploads/fresh.jpg',
        fresh: true,
    };
    const needsIndexProduct = {
        _id: 'needs-index',
        name: 'Needs Index Product',
        thumbnailImage: 'uploads/needs-index.jpg',
        fresh: false,
    };
    const failingProduct = {
        _id: 'failing-product',
        name: 'Failing Product',
        thumbnailImage: 'uploads/failing-product.jpg',
        fresh: false,
    };

    await withMockedAiController(
        {
            productMock: {
                find(filters) {
                    assert.deepEqual(filters, { status: 'active', isArchived: { $ne: true } });
                    return createQuery([noImageProduct, freshProduct, needsIndexProduct, failingProduct]);
                },
            },
            utilsMock: {
                getProductImageSource: (product) => product.thumbnailImage || '',
                hasFreshAiFeatures: (product) => product.fresh === true,
                markProductAiIndexStale: (product) => {
                    if (product === noImageProduct) {
                        product.featuresIndexed = false;
                        return true;
                    }
                    return false;
                },
                indexProductDocument: async (product) => {
                    if (product === failingProduct) {
                        throw new Error('downstream AI timeout');
                    }
                    return [0.1, 0.2, 0.3];
                },
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.indexAllProducts({}, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.total, 4);
            assert.equal(res.body.indexed, 1);
            assert.equal(res.body.skipped, 2);
            assert.equal(res.body.failed, 1);
            assert.equal(noImageProduct.saveCalls, 1);
            assert.deepEqual(res.body.errors, [
                {
                    productId: 'failing-product',
                    name: 'Failing Product',
                    error: 'downstream AI timeout',
                },
            ]);
        },
    );
});

test('indexAllProducts caps the returned bulk error list at 20 entries', { concurrency: false }, async () => {
    const failingProducts = Array.from({ length: 22 }, (_, index) => ({
        _id: `bulk-fail-${index}`,
        name: `Bulk Fail ${index}`,
        thumbnailImage: `uploads/bulk-fail-${index}.jpg`,
    }));

    await withMockedAiController(
        {
            productMock: {
                find() {
                    return createQuery(failingProducts);
                },
            },
            utilsMock: {
                getProductImageSource: (product) => product.thumbnailImage,
                hasFreshAiFeatures: () => false,
                indexProductDocument: async (product) => {
                    throw new Error(`index failed for ${product._id}`);
                },
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.indexAllProducts({}, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.failed, 22);
            assert.equal(res.body.errors.length, 20);
            assert.equal(res.body.errors[0].productId, 'bulk-fail-0');
            assert.equal(res.body.errors[19].productId, 'bulk-fail-19');
        },
    );
});

test('getIndexStatus returns pending samples capped at eight and AI health fallback details', { concurrency: false }, async () => {
    const pendingCandidates = Array.from({ length: 10 }, (_, index) => ({
        _id: `pending-${index}`,
        name: `Pending ${index}`,
        sku: `PENDING-${index}`,
        thumbnailImage: `uploads/pending-${index}.jpg`,
        images: [],
        updatedAt: new Date(`2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
        fresh: false,
    }));
    pendingCandidates[2].fresh = true;

    await withMockedAiController(
        {
            productMock: {
                find(filters) {
                    assert.deepEqual(filters, { status: 'active', isArchived: { $ne: true } });
                    return createQuery(pendingCandidates);
                },
            },
            utilsMock: {
                getAiCatalogStats: async () => ({
                    total: 18,
                    indexed: 8,
                    pending: 10,
                    productsWithImages: 16,
                    productsMissingImages: 2,
                    percentComplete: 44.4,
                    ready: false,
                }),
                getAiServiceHealth: async () => {
                    throw new Error('health endpoint timeout');
                },
                hasFreshAiFeatures: (product) => product.fresh === true,
            },
        },
        async (controller) => {
            const res = createResponseCapture();

            await controller.getIndexStatus({}, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.total, 18);
            assert.equal(res.body.samplePending.length, 8);
            assert.equal(res.body.samplePending[0]._id, 'pending-0');
            assert.equal(res.body.samplePending[7]._id, 'pending-8');
            assert.deepEqual(res.body.aiService, {
                healthy: false,
                error: 'health endpoint timeout',
                serviceUrl: AI_SERVICE_URL,
            });
        },
    );
});