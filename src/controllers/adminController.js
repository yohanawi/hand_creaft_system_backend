const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Blog = require('../models/Blog');
const Order = require('../models/Order');
const SellerPayout = require('../models/SellerPayout');
const StockMovement = require('../models/StockMovement');
const bcrypt = require('bcrypt');
const { logAdminActivity } = require('../utils/activityLogger');

const SALES_ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
const SALES_PAYMENT_STATUSES = ['paid', 'cod_due'];

const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || '').trim());

const sumOrderTotals = async (match) => {
    const result = await Order.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    return Number(result[0]?.total || 0);
};

const getRangeMonths = (value) => {
    const parsed = Number(value);
    return [3, 6, 12].includes(parsed) ? parsed : 6;
};

const buildRevenueBuckets = (months) => {
    const buckets = [];
    const cursor = new Date();
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    cursor.setMonth(cursor.getMonth() - months + 1);

    for (let index = 0; index < months; index += 1) {
        const bucketDate = new Date(cursor);
        bucketDate.setMonth(cursor.getMonth() + index);
        buckets.push({
            key: `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, '0')}`,
            label: bucketDate.toLocaleString('en-US', { month: 'short' }),
        });
    }

    return buckets;
};

// GET /api/admin/stats
exports.getDashboardStats = async (req, res) => {
    try {
        const rangeMonths = getRangeMonths(req.query.rangeMonths);
        const rangeStart = new Date();
        rangeStart.setDate(1);
        rangeStart.setHours(0, 0, 0, 0);
        rangeStart.setMonth(rangeStart.getMonth() - rangeMonths + 1);

        const [totalUsers, totalSellers, totalProducts, totalCategories, totalSubcategories, totalBlogs,
            activeProducts, featuredProducts, outOfStock, lowStockProducts,
            paymentAwaiting, paymentPaid, paymentFailed, paymentRefunded,
            totalOrders, totalRevenue, pendingSellerApplications, pendingPayoutRequests,
            recentStockMovements] = await Promise.all([
                User.countDocuments(),
                User.countDocuments({ role: 'seller' }),
                Product.countDocuments(),
                Category.countDocuments(),
                Subcategory.countDocuments(),
                Blog.countDocuments(),
                Product.countDocuments({ status: 'active' }),
                Product.countDocuments({ isFeatured: true }),
                Product.countDocuments({ availabilityStatus: 'out_of_stock' }),
                Product.countDocuments({
                    availabilityStatus: { $ne: 'out_of_stock' },
                    $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
                }),
                Order.countDocuments({ paymentStatus: 'awaiting_payment' }),
                Order.countDocuments({ paymentStatus: 'paid' }),
                Order.countDocuments({ paymentStatus: 'failed' }),
                Order.countDocuments({ paymentStatus: 'refunded' }),
                Order.countDocuments(),
                sumOrderTotals({ paymentStatus: 'paid' }),
                User.countDocuments({ role: 'seller', sellerStatus: 'pending' }),
                SellerPayout.countDocuments({ status: 'pending' }),
                StockMovement.find()
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .populate('product', 'name sku')
                    .populate('performedBy', 'name'),
            ]);

        const [revenueTrendAgg, orderStatusAgg, topSellingProductsAgg, sellerPerformanceAgg] = await Promise.all([
            Order.aggregate([
                {
                    $match: {
                        paymentStatus: 'paid',
                        createdAt: { $gte: rangeStart },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                        },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            Order.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Order.aggregate([
                {
                    $match: {
                        status: { $in: SALES_ORDER_STATUSES },
                        paymentStatus: { $in: SALES_PAYMENT_STATUSES },
                    },
                },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.product',
                        name: { $first: '$items.name' },
                        quantity: { $sum: '$items.quantity' },
                        revenue: {
                            $sum: {
                                $multiply: [
                                    '$items.quantity',
                                    { $ifNull: ['$items.salePrice', '$items.price'] },
                                ],
                            },
                        },
                    },
                },
                { $sort: { quantity: -1, revenue: -1 } },
                { $limit: 5 },
            ]),
            Order.aggregate([
                {
                    $match: {
                        status: { $in: SALES_ORDER_STATUSES },
                        paymentStatus: { $in: SALES_PAYMENT_STATUSES },
                    },
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.sellerFulfillment.seller': { $ne: null },
                    },
                },
                {
                    $group: {
                        _id: '$items.sellerFulfillment.seller',
                        shopName: { $first: '$items.sellerFulfillment.shopName' },
                        grossSales: { $sum: '$items.sellerFulfillment.grossAmount' },
                        itemsSold: { $sum: '$items.quantity' },
                        orderIds: { $addToSet: '$_id' },
                    },
                },
                {
                    $project: {
                        shopName: 1,
                        grossSales: 1,
                        itemsSold: 1,
                        orderCount: { $size: '$orderIds' },
                        averageOrderValue: {
                            $cond: [
                                { $gt: [{ $size: '$orderIds' }, 0] },
                                { $divide: ['$grossSales', { $size: '$orderIds' }] },
                                0,
                            ],
                        },
                    },
                },
                { $sort: { grossSales: -1, orderCount: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'seller',
                    },
                },
                {
                    $unwind: {
                        path: '$seller',
                        preserveNullAndEmptyArrays: true,
                    },
                },
                {
                    $project: {
                        shopName: 1,
                        grossSales: 1,
                        itemsSold: 1,
                        orderCount: 1,
                        averageOrderValue: 1,
                        sellerName: '$seller.name',
                    },
                },
            ]),
        ]);

        // Last 7 days new users
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
        const newProductsThisWeek = await Product.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

        // Recent products
        const recentProducts = await Product.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('category', 'name')
            .select('name price status availabilityStatus createdAt thumbnailImage sku');

        // Recent users
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email role createdAt');

        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email')
            .select('orderNumber total status paymentStatus paymentMethod createdAt');

        const revenueBuckets = buildRevenueBuckets(rangeMonths);
        const revenueTrendMap = new Map(
            revenueTrendAgg.map((row) => [
                `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
                row,
            ])
        );

        res.json({
            stats: {
                totalUsers,
                totalSellers,
                totalProducts,
                totalOrders,
                totalRevenue,
                totalCategories,
                totalSubcategories,
                totalBlogs,
                activeProducts,
                featuredProducts,
                outOfStock,
                lowStockProducts,
                newUsersThisWeek,
                newProductsThisWeek,
                pendingSellerApplications,
                pendingPayoutRequests,
                paymentAwaiting,
                paymentPaid,
                paymentFailed,
                paymentRefunded,
            },
            recentProducts,
            recentUsers,
            recentOrders,
            recentStockMovements,
            analytics: {
                rangeMonths,
                revenueTrend: revenueBuckets.map((bucket) => {
                    const row = revenueTrendMap.get(bucket.key);
                    return {
                        label: bucket.label,
                        revenue: Number(row?.revenue || 0),
                        orders: Number(row?.orders || 0),
                    };
                }),
                orderStatusDistribution: orderStatusAgg.map((row) => ({
                    status: row._id,
                    count: row.count,
                })),
                topSellingProducts: topSellingProductsAgg.map((row) => ({
                    _id: row._id,
                    name: row.name,
                    quantity: row.quantity,
                    revenue: Number(row.revenue || 0),
                })),
                sellerPerformanceComparison: sellerPerformanceAgg.map((row) => ({
                    _id: row._id,
                    shopName: row.shopName || row.sellerName || 'Seller',
                    sellerName: row.sellerName || 'Seller',
                    grossSales: Number(row.grossSales || 0),
                    itemsSold: row.itemsSold || 0,
                    orderCount: row.orderCount || 0,
                    averageOrderValue: Number(row.averageOrderValue || 0),
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/users
exports.getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, role } = req.query;
        const query = {};
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
        ];
        if (role) query.role = role;

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/users/:id
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const before = user.toObject();

        const { name, email, role, password } = req.body;
        if (name) user.name = name;
        if (email) {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (!isValidEmail(normalizedEmail)) {
                return res.status(400).json({ message: 'Please provide a valid email address' });
            }

            if (normalizedEmail !== user.email) {
                const existingUser = await User.findOne({ email: normalizedEmail }).select('_id');
                if (existingUser && String(existingUser._id) !== String(user._id)) {
                    return res.status(400).json({ message: 'Email already exists' });
                }
            }

            user.email = normalizedEmail;
        }
        if (role && ['user', 'seller', 'admin'].includes(role)) {
            user.role = role;
            if (role === 'seller') {
                user.sellerStatus = req.body.sellerStatus && ['pending', 'approved', 'rejected', 'suspended'].includes(req.body.sellerStatus)
                    ? req.body.sellerStatus
                    : 'approved';

                if (!user.sellerProfile?.shopName) {
                    user.sellerProfile = {
                        ...(user.sellerProfile?.toObject ? user.sellerProfile.toObject() : user.sellerProfile),
                        shopName: user.name,
                        contactEmail: user.email,
                        contactPhone: user.phone || '',
                    };
                }
            } else {
                user.sellerStatus = 'inactive';
            }
        }
        if (password) user.password = await bcrypt.hash(password, 10);

        await user.save();
        const updated = user.toObject();
        delete updated.password;

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'user',
            resourceId: user._id,
            resourceName: updated.name || updated.email,
            before,
            after: updated,
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
    try {
        // Prevent deleting yourself
        if (String(req.params.id) === String(req.user._id)) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'User not found' });

        await logAdminActivity({
            req,
            action: 'delete',
            resourceType: 'user',
            resourceId: deleted._id,
            resourceName: deleted.name || deleted.email,
            before: deleted,
            after: null,
        });

        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
