const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Blog = require('../models/Blog');
const Order = require('../models/Order');
const StockMovement = require('../models/StockMovement');
const bcrypt = require('bcrypt');

// GET /api/admin/stats
exports.getDashboardStats = async (req, res) => {
    try {
        const [totalUsers, totalProducts, totalCategories, totalSubcategories, totalBlogs,
            activeProducts, featuredProducts, outOfStock, lowStockProducts,
            paymentAwaiting, paymentPaid, paymentFailed, paymentRefunded,
            recentStockMovements] = await Promise.all([
                User.countDocuments(),
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
                StockMovement.find()
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .populate('product', 'name sku')
                    .populate('performedBy', 'name'),
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

        res.json({
            stats: {
                totalUsers,
                totalProducts,
                totalCategories,
                totalSubcategories,
                totalBlogs,
                activeProducts,
                featuredProducts,
                outOfStock,
                lowStockProducts,
                newUsersThisWeek,
                newProductsThisWeek,
                paymentAwaiting,
                paymentPaid,
                paymentFailed,
                paymentRefunded,
            },
            recentProducts,
            recentUsers,
            recentStockMovements,
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

        const { name, email, role, password } = req.body;
        if (name) user.name = name;
        if (email) user.email = email;
        if (role && ['user', 'admin'].includes(role)) user.role = role;
        if (password) user.password = await bcrypt.hash(password, 10);

        await user.save();
        const updated = user.toObject();
        delete updated.password;
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
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
