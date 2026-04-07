const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { createStockMovement, syncAvailabilityStatus } = require('../utils/inventory');

const buildSeverity = (product) => {
    const quantity = Number(product.quantity || 0);
    const threshold = Number(product.lowStockThreshold || 0);

    if (quantity <= 0) return 'critical';
    if (quantity <= Math.max(1, Math.ceil(threshold / 2))) return 'high';
    return 'medium';
};

const serializeProductAlert = (product) => ({
    _id: product._id,
    name: product.name,
    sku: product.sku,
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    availabilityStatus: product.availabilityStatus,
    thumbnailImage: product.thumbnailImage || '',
    severity: buildSeverity(product),
    category: product.category,
});

exports.getInventoryOverview = async (req, res) => {
    try {
        const [
            totalProducts,
            outOfStockCount,
            lowStockCount,
            lowStockProducts,
            recentMovements,
            stockTotals,
        ] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ availabilityStatus: 'out_of_stock' }),
            Product.countDocuments({
                availabilityStatus: { $ne: 'out_of_stock' },
                $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
            }),
            Product.find({
                availabilityStatus: { $ne: 'out_of_stock' },
                $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
            })
                .sort({ quantity: 1, updatedAt: -1 })
                .limit(12)
                .select('name sku quantity lowStockThreshold availabilityStatus thumbnailImage category')
                .populate('category', 'name'),
            StockMovement.find()
                .sort({ createdAt: -1 })
                .limit(20)
                .populate('product', 'name sku thumbnailImage')
                .populate('performedBy', 'name email'),
            Product.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUnits: { $sum: '$quantity' },
                        estimatedStockValue: {
                            $sum: {
                                $multiply: [
                                    '$quantity',
                                    { $ifNull: ['$salePrice', '$price'] },
                                ],
                            },
                        },
                    },
                },
            ]),
        ]);

        const summary = stockTotals[0] || { totalUnits: 0, estimatedStockValue: 0 };

        res.json({
            stats: {
                totalProducts,
                outOfStockCount,
                lowStockCount,
                totalUnits: summary.totalUnits,
                estimatedStockValue: Number(summary.estimatedStockValue || 0).toFixed(2),
            },
            lowStockAlerts: lowStockProducts.map(serializeProductAlert),
            recentMovements,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getStockMovements = async (req, res) => {
    try {
        const { page = 1, limit = 25, productId, type, search } = req.query;
        const query = {};

        if (productId) query.product = productId;
        if (type) query.type = type;
        if (search) {
            query.$or = [
                { sku: { $regex: search, $options: 'i' } },
                { productName: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await StockMovement.countDocuments(query);
        const movements = await StockMovement.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('product', 'name sku thumbnailImage')
            .populate('performedBy', 'name email');

        res.json({
            movements,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)) || 1,
            totalPages: Math.ceil(total / Number(limit)) || 1,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.restockProduct = async (req, res) => {
    try {
        const quantity = Number(req.body.quantity);
        const note = String(req.body.note || '').trim();

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ message: 'A positive quantity is required' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const previousQuantity = Number(product.quantity || 0);
        product.quantity = previousQuantity + quantity;
        syncAvailabilityStatus(product);
        await product.save();

        await createStockMovement({
            product,
            type: 'restock',
            reason: 'Admin restock',
            note,
            quantityChange: quantity,
            previousQuantity,
            newQuantity: Number(product.quantity || 0),
            referenceType: 'admin_restock',
            referenceId: String(product._id),
            performedBy: req.user?._id || null,
        });

        res.json({ message: 'Product restocked successfully', product });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adjustProductStock = async (req, res) => {
    try {
        const quantityDelta = Number(req.body.quantityDelta);
        const note = String(req.body.note || '').trim();
        const reason = String(req.body.reason || 'Manual stock adjustment').trim();

        if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
            return res.status(400).json({ message: 'A non-zero quantityDelta is required' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const previousQuantity = Number(product.quantity || 0);
        const nextQuantity = previousQuantity + quantityDelta;

        if (nextQuantity < 0) {
            return res.status(400).json({ message: 'Adjustment would result in negative stock' });
        }

        product.quantity = nextQuantity;
        syncAvailabilityStatus(product);
        await product.save();

        await createStockMovement({
            product,
            type: 'manual_adjustment',
            reason,
            note,
            quantityChange: quantityDelta,
            previousQuantity,
            newQuantity: Number(product.quantity || 0),
            referenceType: 'admin_adjustment',
            referenceId: String(product._id),
            performedBy: req.user?._id || null,
        });

        res.json({ message: 'Stock adjusted successfully', product });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};