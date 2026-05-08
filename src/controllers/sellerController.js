const slugify = require('slugify');
const Order = require('../models/Order');
const Product = require('../models/Product');
const SellerPayout = require('../models/SellerPayout');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
const { createStockMovement, syncAvailabilityStatus } = require('../utils/inventory');

const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMAGE_PATH_PATTERN = /^(https?:\/\/|\/?uploads\/)/i;
const URL_PATTERN = /^https?:\/\//i;

const toId = (value) => String(value || '');

const getSellerShopName = (user) => (
    String(user?.sellerProfile?.shopName || user?.name || 'HandCraft Seller').trim()
);

const createBadRequest = (message, field = '') => {
    const error = new Error(message);
    error.statusCode = 400;
    error.field = field;
    return error;
};

const normalizeOptionalString = (value) => String(value || '').trim();

const normalizeOptionalEmail = (value, field) => {
    const normalized = normalizeOptionalString(value).toLowerCase();
    if (!normalized) {
        return '';
    }

    if (!EMAIL_PATTERN.test(normalized)) {
        throw createBadRequest('Please enter a valid email address', field);
    }

    return normalized;
};

const normalizeOptionalUrl = (value, field, { allowUploadPath = false } = {}) => {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
        return '';
    }

    const valid = allowUploadPath ? IMAGE_PATH_PATTERN.test(normalized) : URL_PATTERN.test(normalized);
    if (!valid) {
        throw createBadRequest(field === 'facebookUrl' ? 'Please enter a valid URL' : 'Please enter a valid image URL', field);
    }

    return normalized;
};

const normalizeSupportedCurrency = (value) => {
    const normalized = String(value || 'USD').trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(normalized)) {
        throw createBadRequest('Unsupported currency code', 'defaultCurrency');
    }

    return normalized;
};

const normalizeNonNegativeInteger = (value, field, fallback = 0) => {
    const parsed = typeof value === 'undefined' || value === null || value === '' ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw createBadRequest(`${field} must be a non-negative integer`, field);
    }

    return parsed;
};

const buildStatusDistribution = (orders, sellerId) => {
    const distribution = {
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
    };

    orders.forEach((order) => {
        const sellerOrder = toSellerOrderSlice(order, sellerId);
        const status = String(sellerOrder.sellerStatus || 'pending');
        if (distribution[status] !== undefined) {
            distribution[status] += 1;
        }
    });

    return distribution;
};

const buildRevenueTrend = (orders, sellerId, startDate) => {
    const buckets = new Map();

    orders.forEach((order) => {
        if (order.createdAt < startDate) {
            return;
        }

        const dayKey = new Date(order.createdAt).toISOString().slice(0, 10);
        const current = buckets.get(dayKey) || { revenue: 0, orders: 0 };
        const sellerItems = (order.items || []).filter((item) => toId(item?.sellerFulfillment?.seller) === toId(sellerId));
        const deliveredRevenue = sellerItems
            .filter((item) => item?.sellerFulfillment?.status === 'delivered')
            .reduce((sum, item) => sum + Number(item?.sellerFulfillment?.grossAmount || 0), 0);

        current.revenue += deliveredRevenue;
        current.orders += sellerItems.length > 0 ? 1 : 0;
        buckets.set(dayKey, current);
    });

    return Array.from(buckets.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([date, row]) => ({
            date,
            revenue: roundCurrency(row.revenue),
            orders: row.orders,
        }));
};

const toSellerOrderSlice = (order, sellerId) => {
    const sellerItems = (order.items || []).filter((item) => (
        toId(item?.sellerFulfillment?.seller) === toId(sellerId)
    ));

    const sellerGross = sellerItems.reduce(
        (sum, item) => sum + Number(item?.sellerFulfillment?.grossAmount || 0),
        0,
    );
    const sellerNet = sellerItems.reduce(
        (sum, item) => sum + Number(item?.sellerFulfillment?.sellerNetAmount || 0),
        0,
    );

    const sellerStatus = sellerItems[0]?.sellerFulfillment?.status || order.status;
    const sellerTrackingNumber = sellerItems[0]?.sellerFulfillment?.trackingNumber || '';
    const sellerCourier = sellerItems[0]?.sellerFulfillment?.courier || '';
    const sellerEstimatedDelivery = sellerItems[0]?.sellerFulfillment?.estimatedDelivery || null;
    const payoutStatus = sellerItems.every((item) => item?.sellerFulfillment?.payoutStatus === 'paid')
        ? 'paid'
        : sellerItems.some((item) => item?.sellerFulfillment?.payoutStatus === 'requested')
            ? 'requested'
            : sellerItems.some((item) => item?.sellerFulfillment?.payoutStatus === 'available')
                ? 'available'
                : sellerItems.some((item) => item?.sellerFulfillment?.payoutStatus === 'reversed')
                    ? 'reversed'
                    : 'unpaid';

    return {
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        sellerStatus,
        sellerTrackingNumber,
        sellerCourier,
        sellerEstimatedDelivery,
        payoutStatus,
        user: order.user,
        shippingAddress: order.shippingAddress,
        customerNote: order.customerNote,
        items: sellerItems,
        summary: {
            itemCount: sellerItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
            grossAmount: roundCurrency(sellerGross),
            netAmount: roundCurrency(sellerNet),
        },
    };
};

const getSellerFinancialSummary = async (sellerId) => {
    const orders = await Order.find({ 'items.sellerFulfillment.seller': sellerId })
        .select('items paymentStatus')
        .lean();

    let grossSales = 0;
    let availableBalance = 0;
    let requestedBalance = 0;
    let paidOutBalance = 0;

    orders.forEach((order) => {
        (order.items || []).forEach((item) => {
            if (toId(item?.sellerFulfillment?.seller) !== toId(sellerId)) {
                return;
            }

            grossSales += Number(item?.sellerFulfillment?.grossAmount || 0);

            const payoutStatus = String(item?.sellerFulfillment?.payoutStatus || 'unpaid');
            const netAmount = Number(item?.sellerFulfillment?.sellerNetAmount || 0);

            if (payoutStatus === 'available') availableBalance += netAmount;
            if (payoutStatus === 'requested') requestedBalance += netAmount;
            if (payoutStatus === 'paid') paidOutBalance += netAmount;
        });
    });

    return {
        grossSales: roundCurrency(grossSales),
        availableBalance: roundCurrency(availableBalance),
        requestedBalance: roundCurrency(requestedBalance),
        paidOutBalance: roundCurrency(paidOutBalance),
    };
};

const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

exports.getSellerOverview = async (req, res) => {
    try {
        const sellerId = req.user._id;

        const [
            seller,
            totalProducts,
            activeProducts,
            inactiveProducts,
            lowStockProducts,
            pendingOrders,
            recentProducts,
            recentOrders,
            financials,
        ] = await Promise.all([
            User.findById(sellerId).select('-password'),
            Product.countDocuments({ seller: sellerId }),
            Product.countDocuments({ seller: sellerId, status: 'active' }),
            Product.countDocuments({ seller: sellerId, status: 'inactive' }),
            Product.countDocuments({
                seller: sellerId,
                availabilityStatus: { $ne: 'out_of_stock' },
                $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
            }),
            Order.countDocuments({
                items: {
                    $elemMatch: {
                        'sellerFulfillment.seller': sellerId,
                        'sellerFulfillment.status': { $in: ['pending', 'confirmed', 'processing'] },
                    },
                },
            }),
            Product.find({ seller: sellerId })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('name sku quantity status availabilityStatus updatedAt thumbnailImage lowStockThreshold')
                .lean(),
            Order.find({ 'items.sellerFulfillment.seller': sellerId })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('user', 'name email')
                .populate('items.product', 'name thumbnailImage slug')
                .lean(),
            getSellerFinancialSummary(sellerId),
        ]);

        res.json({
            seller: {
                id: seller?._id,
                name: seller?.name,
                email: seller?.email,
                sellerStatus: seller?.sellerStatus || 'approved',
                shopName: getSellerShopName(seller),
                profile: seller?.sellerProfile || {},
            },
            stats: {
                totalProducts,
                activeProducts,
                inactiveProducts,
                lowStockProducts,
                pendingOrders,
                grossSales: financials.grossSales,
                availableBalance: financials.availableBalance,
                requestedBalance: financials.requestedBalance,
                paidOutBalance: financials.paidOutBalance,
            },
            recentProducts,
            recentOrders: recentOrders.map((order) => toSellerOrderSlice(order, sellerId)),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getSellerProfile = async (req, res) => {
    try {
        const seller = await User.findById(req.user._id).select('-password');
        if (!seller) {
            return res.status(404).json({ message: 'Seller not found' });
        }

        return res.json({
            seller: {
                id: seller._id,
                name: seller.name,
                email: seller.email,
                phone: seller.phone || '',
                sellerStatus: seller.sellerStatus,
                sellerProfile: seller.sellerProfile || {},
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.updateSellerProfile = async (req, res) => {
    try {
        const seller = await User.findById(req.user._id);
        if (!seller) {
            return res.status(404).json({ message: 'Seller not found' });
        }

        const {
            name,
            phone,
            shopName,
            bio,
            logo,
            banner,
            contactEmail,
            contactPhone,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            instagramHandle,
            facebookUrl,
            materials,
            processingTimeLabel,
            shippingPolicy,
            returnPolicy,
            bankName,
            accountHolderName,
            accountNumber,
            routingNumber,
            payoutEmail,
            defaultCurrency,
        } = req.body;

        if (typeof name === 'string' && name.trim()) seller.name = name.trim();
        if (typeof phone === 'string') seller.phone = phone.trim();

        const nextShopName = String(shopName || seller.sellerProfile.shopName || seller.name || '').trim();
        const nextShopSlug = nextShopName ? slugify(nextShopName, { lower: true, strict: true }) : '';

        if (nextShopSlug) {
            const existingShop = await User.exists({
                _id: { $ne: seller._id },
                role: 'seller',
                'sellerProfile.shopSlug': nextShopSlug,
            });
            if (existingShop) {
                return res.status(400).json({ message: 'This shop name is already taken', field: 'shopName' });
            }
        }

        seller.sellerProfile.shopName = nextShopName;
        seller.sellerProfile.shopSlug = nextShopSlug;
        if (typeof bio === 'string') seller.sellerProfile.bio = bio.trim();
        if (typeof logo === 'string') seller.sellerProfile.logo = normalizeOptionalUrl(logo, 'logo', { allowUploadPath: true });
        if (typeof banner === 'string') seller.sellerProfile.banner = normalizeOptionalUrl(banner, 'banner', { allowUploadPath: true });
        if (typeof contactEmail === 'string') seller.sellerProfile.contactEmail = normalizeOptionalEmail(contactEmail, 'contactEmail');
        if (typeof contactPhone === 'string') seller.sellerProfile.contactPhone = contactPhone.trim();
        if (typeof addressLine1 === 'string') seller.sellerProfile.addressLine1 = addressLine1.trim();
        if (typeof addressLine2 === 'string') seller.sellerProfile.addressLine2 = addressLine2.trim();
        if (typeof city === 'string') seller.sellerProfile.city = city.trim();
        if (typeof state === 'string') seller.sellerProfile.state = state.trim();
        if (typeof postalCode === 'string') seller.sellerProfile.postalCode = postalCode.trim();
        if (typeof country === 'string' && country.trim()) seller.sellerProfile.country = country.trim();
        if (typeof instagramHandle === 'string') seller.sellerProfile.instagramHandle = instagramHandle.trim();
        if (typeof facebookUrl === 'string') seller.sellerProfile.facebookUrl = normalizeOptionalUrl(facebookUrl, 'facebookUrl');
        if (typeof materials !== 'undefined') seller.sellerProfile.materials = normalizeStringArray(materials);
        if (typeof processingTimeLabel === 'string') seller.sellerProfile.processingTimeLabel = processingTimeLabel.trim();
        if (typeof shippingPolicy === 'string') seller.sellerProfile.shippingPolicy = shippingPolicy.trim();
        if (typeof returnPolicy === 'string') seller.sellerProfile.returnPolicy = returnPolicy.trim();
        if (typeof bankName === 'string') seller.sellerProfile.bankName = bankName.trim();
        if (typeof accountHolderName === 'string') seller.sellerProfile.accountHolderName = accountHolderName.trim();
        if (typeof accountNumber === 'string') seller.sellerProfile.accountNumber = accountNumber.trim();
        if (typeof routingNumber === 'string') seller.sellerProfile.routingNumber = routingNumber.trim();
        if (typeof payoutEmail === 'string') seller.sellerProfile.payoutEmail = normalizeOptionalEmail(payoutEmail, 'payoutEmail');
        if (typeof defaultCurrency !== 'undefined') seller.sellerProfile.defaultCurrency = normalizeSupportedCurrency(defaultCurrency);

        if (seller.role !== 'seller') {
            seller.role = 'seller';
        }

        if (seller.sellerStatus === 'inactive') {
            seller.sellerStatus = 'approved';
        }

        await seller.save();

        await Product.updateMany(
            { seller: seller._id },
            { $set: { sellerShopName: getSellerShopName(seller) } },
        );

        return res.json({ message: 'Seller profile updated successfully', seller });
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ message: error.message, field: error.field || undefined });
        }
        return res.status(500).json({ message: error.message });
    }
};

exports.getSellerAnalytics = async (req, res) => {
    try {
        const sellerId = req.user._id;
        const requestedRange = Number(req.query.range || 30);
        const range = [7, 30, 90].includes(requestedRange) ? requestedRange : 30;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (range - 1));

        const [orders, products] = await Promise.all([
            Order.find({ 'items.sellerFulfillment.seller': sellerId })
                .sort({ createdAt: -1 })
                .populate('items.product', 'name')
                .lean(),
            Product.find({ seller: sellerId })
                .select('name quantity updatedAt')
                .lean(),
        ]);

        let totalRevenue = 0;
        let completedOrders = 0;
        const productSales = new Map();

        orders.forEach((order) => {
            const sellerItems = (order.items || []).filter((item) => toId(item?.sellerFulfillment?.seller) === toId(sellerId));
            if (sellerItems.length === 0) {
                return;
            }

            const deliveredItems = sellerItems.filter((item) => item?.sellerFulfillment?.status === 'delivered');
            if (deliveredItems.length > 0) {
                completedOrders += 1;
            }

            deliveredItems.forEach((item) => {
                const revenue = Number(item?.sellerFulfillment?.grossAmount || 0);
                const quantity = Number(item?.quantity || 0);
                totalRevenue += revenue;

                const productId = toId(item?.product?._id || item?.product);
                const current = productSales.get(productId) || {
                    productId,
                    productName: item?.name || item?.product?.name || 'Product',
                    quantitySold: 0,
                    revenue: 0,
                };
                current.quantitySold += quantity;
                current.revenue += revenue;
                productSales.set(productId, current);
            });
        });

        const totalOrders = orders.length;
        const last30Start = new Date();
        last30Start.setHours(0, 0, 0, 0);
        last30Start.setDate(last30Start.getDate() - 29);
        const last30Sales = new Map();

        orders.forEach((order) => {
            if (new Date(order.createdAt) < last30Start) {
                return;
            }

            (order.items || []).forEach((item) => {
                if (
                    toId(item?.sellerFulfillment?.seller) !== toId(sellerId)
                    || item?.sellerFulfillment?.status !== 'delivered'
                ) {
                    return;
                }

                const productId = toId(item?.product?._id || item?.product);
                last30Sales.set(productId, (last30Sales.get(productId) || 0) + Number(item?.quantity || 0));
            });
        });

        const productPerformance = products.map((product) => {
            const sales = productSales.get(toId(product._id)) || { quantitySold: 0, revenue: 0 };
            const averageInventory = Math.max((Number(product.quantity || 0) + Number(sales.quantitySold || 0)) / 2, 1);
            return {
                productId: product._id,
                productName: product.name,
                quantitySold: sales.quantitySold || 0,
                revenue: roundCurrency(sales.revenue || 0),
                inventoryTurnoverRate: roundCurrency((sales.quantitySold || 0) / averageInventory),
                currentQuantity: Number(product.quantity || 0),
            };
        });

        const zeroSalesProductsLast30Days = productPerformance
            .filter((product) => (last30Sales.get(toId(product.productId)) || 0) === 0)
            .map((product) => ({
                productId: product.productId,
                productName: product.productName,
                currentQuantity: product.currentQuantity,
            }));

        const sortedByQuantity = [...productPerformance]
            .sort((left, right) => right.quantitySold - left.quantitySold)
            .slice(0, 5);
        const sortedByRevenue = [...productPerformance]
            .sort((left, right) => right.revenue - left.revenue)
            .slice(0, 5);

        const monthlySalesMap = new Map();
        orders.forEach((order) => {
            const monthKey = new Date(order.createdAt).toISOString().slice(0, 7);
            const revenue = (order.items || []).reduce((sum, item) => {
                if (
                    toId(item?.sellerFulfillment?.seller) !== toId(sellerId)
                    || item?.sellerFulfillment?.status !== 'delivered'
                ) {
                    return sum;
                }

                return sum + Number(item?.sellerFulfillment?.grossAmount || 0);
            }, 0);

            monthlySalesMap.set(monthKey, (monthlySalesMap.get(monthKey) || 0) + revenue);
        });

        const monthlySales = Array.from(monthlySalesMap.entries())
            .map(([month, revenue]) => ({ month, revenue: roundCurrency(revenue) }))
            .sort((left, right) => left.month.localeCompare(right.month));

        return res.json({
            range,
            summary: {
                totalRevenue: roundCurrency(totalRevenue),
                averageOrderValue: roundCurrency(completedOrders > 0 ? totalRevenue / completedOrders : 0),
                conversionRate: roundCurrency(totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0),
                totalOrders,
                completedOrders,
            },
            statusDistribution: buildStatusDistribution(orders, sellerId),
            revenueTrend: buildRevenueTrend(orders, sellerId, startDate),
            topProductsByQuantity: sortedByQuantity,
            topProductsByRevenue: sortedByRevenue,
            productPerformance,
            zeroSalesProductsLast30Days,
            monthlySales,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.getSellerInventoryOverview = async (req, res) => {
    try {
        const sellerId = req.user._id;
        const productIds = await Product.find({ seller: sellerId }).distinct('_id');

        const [
            totalProducts,
            outOfStockCount,
            lowStockCount,
            lowStockProducts,
            recentMovements,
            stockTotals,
        ] = await Promise.all([
            Product.countDocuments({ seller: sellerId }),
            Product.countDocuments({ seller: sellerId, availabilityStatus: 'out_of_stock' }),
            Product.countDocuments({
                seller: sellerId,
                availabilityStatus: { $ne: 'out_of_stock' },
                $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
            }),
            Product.find({
                seller: sellerId,
                availabilityStatus: { $ne: 'out_of_stock' },
                $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
            })
                .sort({ quantity: 1, updatedAt: -1 })
                .limit(12)
                .select('name sku quantity lowStockThreshold availabilityStatus thumbnailImage')
                .lean(),
            StockMovement.find({ product: { $in: productIds } })
                .sort({ createdAt: -1 })
                .limit(20)
                .populate('product', 'name sku thumbnailImage')
                .populate('performedBy', 'name email')
                .lean(),
            Product.aggregate([
                { $match: { seller: sellerId } },
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
                totalUnits: summary.totalUnits || 0,
                estimatedStockValue: roundCurrency(summary.estimatedStockValue || 0),
            },
            lowStockAlerts: lowStockProducts,
            recentMovements,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.restockSellerProduct = async (req, res) => {
    try {
        const quantity = Number(req.body.quantity);
        const note = String(req.body.note || '').trim();

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ message: 'A positive quantity is required' });
        }

        const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
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
            reason: 'Seller restock',
            note,
            quantityChange: quantity,
            previousQuantity,
            newQuantity: Number(product.quantity || 0),
            referenceType: 'seller_restock',
            referenceId: String(product._id),
            performedBy: req.user?._id || null,
        });

        return res.json({ message: 'Product restocked successfully', product });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.adjustSellerProductStock = async (req, res) => {
    try {
        const quantityDelta = Number(req.body.quantityDelta);
        const note = String(req.body.note || '').trim();
        const reason = String(req.body.reason || 'Seller stock adjustment').trim();

        if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
            return res.status(400).json({ message: 'A non-zero quantityDelta is required' });
        }

        const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
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
            referenceType: 'seller_adjustment',
            referenceId: String(product._id),
            performedBy: req.user?._id || null,
        });

        return res.json({ message: 'Stock adjusted successfully', product });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.updateSellerLowStockThreshold = async (req, res) => {
    try {
        const threshold = normalizeNonNegativeInteger(req.body.threshold, 'lowStockThreshold', 5);
        const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        product.lowStockThreshold = threshold;
        await product.save();

        return res.json({
            message: 'Low stock threshold updated successfully',
            product,
        });
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ message: error.message, field: error.field || undefined });
        }
        return res.status(500).json({ message: error.message });
    }
};

exports.getSellerInventoryMovements = async (req, res) => {
    try {
        const { page = 1, limit = 25, productId, type } = req.query;
        const sellerProductIds = await Product.find({ seller: req.user._id }).distinct('_id');
        const query = { product: { $in: sellerProductIds } };

        if (productId) {
            if (!sellerProductIds.some((id) => toId(id) === toId(productId))) {
                return res.status(404).json({ message: 'Product not found' });
            }
            query.product = productId;
        }

        if (type) {
            query.type = String(type).trim();
        }

        const total = await StockMovement.countDocuments(query);
        const movements = await StockMovement.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('product', 'name sku thumbnailImage')
            .populate('performedBy', 'name email')
            .lean();

        return res.json({
            movements,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)) || 1,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.getSellerPayoutOverview = async (req, res) => {
    try {
        const sellerId = req.user._id;
        const seller = await User.findById(sellerId).select('sellerProfile').lean();
        const financials = await getSellerFinancialSummary(sellerId);
        const payouts = await SellerPayout.find({ seller: sellerId })
            .sort({ requestedAt: -1, createdAt: -1 })
            .limit(20)
            .lean();

        return res.json({
            summary: financials,
            payouts,
            sellerProfile: seller?.sellerProfile || {},
            bankDetailsComplete: Boolean(
                seller?.sellerProfile?.bankName
                && seller?.sellerProfile?.accountHolderName
                && seller?.sellerProfile?.accountNumber
                && seller?.sellerProfile?.routingNumber
            ),
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.requestSellerPayout = async (req, res) => {
    try {
        const seller = await User.findById(req.user._id).select('-password');
        if (!seller) {
            return res.status(404).json({ message: 'Seller not found' });
        }

        if (
            !seller.sellerProfile.bankName
            || !seller.sellerProfile.accountHolderName
            || !seller.sellerProfile.accountNumber
            || !seller.sellerProfile.routingNumber
        ) {
            return res.status(400).json({
                message: 'Complete bank details in your seller profile before requesting a payout',
            });
        }

        const orders = await Order.find({ 'items.sellerFulfillment.seller': seller._id });
        const allocations = [];

        orders.forEach((order) => {
            (order.items || []).forEach((item, index) => {
                if (toId(item?.sellerFulfillment?.seller) !== toId(seller._id)) {
                    return;
                }

                if (item?.sellerFulfillment?.payoutStatus !== 'available') {
                    return;
                }

                allocations.push({
                    order,
                    itemIndex: index,
                    grossAmount: Number(item?.sellerFulfillment?.grossAmount || 0),
                    sellerNetAmount: Number(item?.sellerFulfillment?.sellerNetAmount || 0),
                });
            });
        });

        if (allocations.length === 0) {
            return res.status(400).json({ message: 'No available balance to request right now' });
        }

        const payout = await SellerPayout.create({
            seller: seller._id,
            amount: roundCurrency(allocations.reduce((sum, entry) => sum + entry.sellerNetAmount, 0)),
            currency: seller?.sellerProfile?.defaultCurrency || 'USD',
            note: String(req.body.note || '').trim(),
            allocations: allocations.map((entry) => ({
                orderId: entry.order._id,
                itemIndex: entry.itemIndex,
                grossAmount: entry.grossAmount,
                sellerNetAmount: entry.sellerNetAmount,
            })),
        });

        for (const entry of allocations) {
            entry.order.items[entry.itemIndex].sellerFulfillment.payoutStatus = 'requested';
            await entry.order.save();
        }

        return res.status(201).json({
            message: 'Payout request submitted successfully',
            payout,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};