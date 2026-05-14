const test = require('node:test');
const assert = require('node:assert/strict');

const Product = require('../src/models/Product');
const productController = require('../src/controllers/productController');

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
        populate() {
            return query;
        },
        sort() {
            return query;
        },
        skip() {
            return query;
        },
        limit() {
            return query;
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

test('product model syncs archived status into isArchived metadata', async () => {
    const product = new Product({
        name: 'Archived Product',
        price: 10,
        category: '507f1f77bcf86cd799439011',
        sku: 'ARCH-1',
        status: 'archived',
    });

    await product.validate();

    assert.equal(product.isArchived, true);
    assert.ok(product.archivedAt instanceof Date);
    assert.equal(product.isFeatured, false);
});

test('product model clears stale archive metadata when status is not archived', async () => {
    const product = new Product({
        name: 'Inactive Product',
        price: 10,
        category: '507f1f77bcf86cd799439011',
        sku: 'INACT-1',
        status: 'inactive',
        isArchived: true,
        archivedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    await product.validate();

    assert.equal(product.status, 'inactive');
    assert.equal(product.isArchived, false);
    assert.equal(product.archivedAt, null);
});

test('admin archived product queries require the archive flag', async () => {
    const response = createResponseCapture();
    const originalCountDocuments = Product.countDocuments;
    const originalFind = Product.find;
    let countQuery = null;
    let listQuery = null;

    Product.countDocuments = async (query) => {
        countQuery = query;
        return 0;
    };
    Product.find = (query) => {
        listQuery = query;
        return createQuery([]);
    };

    try {
        await productController.getProducts(
            { user: { role: 'admin' }, query: { status: 'archived' } },
            response,
        );

        assert.equal(response.statusCode, 200);
        assert.deepEqual(countQuery, { status: 'archived', isArchived: true });
        assert.deepEqual(listQuery, { status: 'archived', isArchived: true });
    } finally {
        Product.countDocuments = originalCountDocuments;
        Product.find = originalFind;
    }
});

test('seller product listing supports archived status filtering', async () => {
    const response = createResponseCapture();
    const originalCountDocuments = Product.countDocuments;
    const originalFind = Product.find;
    let countQuery = null;
    let listQuery = null;

    Product.countDocuments = async (query) => {
        countQuery = query;
        return 0;
    };
    Product.find = (query) => {
        listQuery = query;
        return createQuery([]);
    };

    try {
        await productController.getSellerProducts(
            { user: { role: 'seller', _id: 'seller-1' }, query: { status: 'archived' } },
            response,
        );

        assert.equal(response.statusCode, 200);
        assert.deepEqual(countQuery, { seller: 'seller-1', status: 'archived' });
        assert.deepEqual(listQuery, { seller: 'seller-1', status: 'archived' });
    } finally {
        Product.countDocuments = originalCountDocuments;
        Product.find = originalFind;
    }
});

test('public product detail excludes archived related products', async () => {
    const response = createResponseCapture();
    const originalFindOne = Product.findOne;
    const originalFind = Product.find;
    let primaryQuery = null;
    let relatedQuery = null;

    Product.findOne = (query) => {
        primaryQuery = query;
        return createQuery({
            _id: 'product-1',
            category: { _id: 'category-1' },
            toObject() {
                return {
                    _id: 'product-1',
                    category: { _id: 'category-1' },
                };
            },
        });
    };
    Product.find = (query) => {
        relatedQuery = query;
        return createQuery([]);
    };

    try {
        await productController.getProductBySlug(
            { params: { slug: 'product-1' }, user: null },
            response,
        );

        assert.equal(response.statusCode, 200);
        assert.deepEqual(primaryQuery, { slug: 'product-1', status: 'active', isArchived: { $ne: true } });
        assert.deepEqual(relatedQuery, {
            _id: { $ne: 'product-1' },
            category: 'category-1',
            status: 'active',
            isArchived: { $ne: true },
        });
    } finally {
        Product.findOne = originalFindOne;
        Product.find = originalFind;
    }
});