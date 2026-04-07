const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');

router.use('/auth', require('./authRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/subcategories', require('./subcategoryRoutes'));
router.use('/products', require('./productRoutes'));
router.use('/coupons', require('./couponRoutes'));
router.use('/blogs', require('./blogRoutes'));
router.use('/ai-search', require('./aiSearchRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/orders', require('./orderRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/cart', require('./cartRoutes'));
router.use('/wishlist', require('./wishlistRoutes'));
router.use('/support', require('./supportRoutes'));

router.get('/profile', protect, (req, res) => {
    res.json(req.user);
});

module.exports = router;
