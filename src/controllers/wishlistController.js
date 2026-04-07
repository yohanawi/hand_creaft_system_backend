const User = require('../models/User');
const Product = require('../models/Product');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const populatedWishlist = (userId) =>
    User.findById(userId)
        .populate('wishlist', 'name thumbnailImage price salePrice sku availabilityStatus quantity category')
        .then((u) => u.wishlist || []);

// ─── GET /wishlist ────────────────────────────────────────────────────────────
exports.getWishlist = async (req, res) => {
    try {
        const wishlist = await populatedWishlist(req.user._id);
        res.json(wishlist);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── POST /wishlist/:productId  (toggle) ─────────────────────────────────────
exports.toggleWishlist = async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const user = await User.findById(req.user._id);
        const idx = user.wishlist.findIndex((id) => id.toString() === req.params.productId);

        let action;
        if (idx !== -1) {
            user.wishlist.splice(idx, 1);
            action = 'removed';
        } else {
            user.wishlist.push(req.params.productId);
            action = 'added';
        }
        await user.save();

        const wishlist = await populatedWishlist(req.user._id);
        res.json({ action, wishlist });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE /wishlist/:productId ──────────────────────────────────────────────
exports.removeFromWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.wishlist = user.wishlist.filter((id) => id.toString() !== req.params.productId);
        await user.save();

        res.json(await populatedWishlist(req.user._id));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminGetWishlistInsights = async (req, res) => {
    try {
        const usersWithWishlist = await User.find({ 'wishlist.0': { $exists: true } })
            .select('wishlist name email');

        const orders = await require('../models/Order').find()
            .select('user items total createdAt');

        const purchasedByUser = new Map();
        for (const order of orders) {
            const userId = String(order.user);
            const existing = purchasedByUser.get(userId) || new Set();
            for (const item of order.items) {
                existing.add(String(item.product));
            }
            purchasedByUser.set(userId, existing);
        }

        let totalWishlistItems = 0;
        let convertedWishlistItems = 0;
        let usersWithConvertedWishlist = 0;
        const wishlistedProductMap = new Map();
        const convertedProductMap = new Map();

        for (const user of usersWithWishlist) {
            const wishlistIds = Array.isArray(user.wishlist) ? user.wishlist.map((id) => String(id)) : [];
            const purchased = purchasedByUser.get(String(user._id)) || new Set();
            const convertedForUser = new Set();

            totalWishlistItems += wishlistIds.length;

            for (const productId of wishlistIds) {
                wishlistedProductMap.set(productId, (wishlistedProductMap.get(productId) || 0) + 1);
                if (purchased.has(productId)) {
                    convertedWishlistItems += 1;
                    convertedForUser.add(productId);
                    convertedProductMap.set(productId, (convertedProductMap.get(productId) || 0) + 1);
                }
            }

            if (convertedForUser.size > 0) {
                usersWithConvertedWishlist += 1;
            }
        }

        const productIds = Array.from(new Set([
            ...wishlistedProductMap.keys(),
            ...convertedProductMap.keys(),
        ]));

        const products = await Product.find({ _id: { $in: productIds } })
            .select('name sku thumbnailImage price salePrice')
            .lean();
        const productMap = new Map(products.map((product) => [String(product._id), product]));

        const topWishlistedProducts = Array.from(wishlistedProductMap.entries())
            .map(([productId, count]) => {
                const converted = convertedProductMap.get(productId) || 0;
                return {
                    product: productMap.get(productId) || { _id: productId, name: 'Unknown product', sku: '' },
                    wishlistedUsers: count,
                    convertedUsers: converted,
                    conversionRate: count > 0 ? Number(((converted / count) * 100).toFixed(2)) : 0,
                };
            })
            .sort((a, b) => b.wishlistedUsers - a.wishlistedUsers)
            .slice(0, 10);

        const topConvertedProducts = Array.from(convertedProductMap.entries())
            .map(([productId, count]) => ({
                product: productMap.get(productId) || { _id: productId, name: 'Unknown product', sku: '' },
                convertedUsers: count,
                wishlistedUsers: wishlistedProductMap.get(productId) || 0,
                conversionRate: (wishlistedProductMap.get(productId) || 0) > 0
                    ? Number(((count / (wishlistedProductMap.get(productId) || 1)) * 100).toFixed(2))
                    : 0,
            }))
            .sort((a, b) => b.convertedUsers - a.convertedUsers)
            .slice(0, 10);

        res.json({
            summary: {
                usersWithWishlist: usersWithWishlist.length,
                totalWishlistItems,
                convertedWishlistItems,
                uniqueWishlistedProducts: wishlistedProductMap.size,
                usersWithConvertedWishlist,
                userConversionRate: usersWithWishlist.length > 0
                    ? Number(((usersWithConvertedWishlist / usersWithWishlist.length) * 100).toFixed(2))
                    : 0,
                itemConversionRate: totalWishlistItems > 0
                    ? Number(((convertedWishlistItems / totalWishlistItems) * 100).toFixed(2))
                    : 0,
            },
            topWishlistedProducts,
            topConvertedProducts,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
