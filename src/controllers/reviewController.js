const Product = require('../models/Product');
const Review = require('../models/Review');
const Order = require('../models/Order');

const syncProductRating = async (productId) => {
    const stats = await Review.aggregate([
        { $match: { product: Product.db.base.Types.ObjectId.createFromHexString(String(productId)) } },
        {
            $group: {
                _id: '$product',
                averageRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 },
            },
        },
    ]);

    const averageRating = stats[0]?.averageRating ? Number(stats[0].averageRating.toFixed(1)) : 0;
    const reviewCount = stats[0]?.reviewCount || 0;

    await Product.findByIdAndUpdate(productId, { averageRating, reviewCount });
};

exports.getProductReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ product: req.params.id })
            .populate('user', 'name')
            .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createOrUpdateReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const numericRating = Number(rating);
        if (!numericRating || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const hasPurchased = await Order.exists({
            user: req.user._id,
            status: { $in: ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'] },
            'items.product': product._id,
        });

        if (!hasPurchased) {
            return res.status(400).json({ message: 'Only customers who ordered this product can review it' });
        }

        const review = await Review.findOneAndUpdate(
            { product: product._id, user: req.user._id },
            { rating: numericRating, comment: String(comment || '').trim() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).populate('user', 'name');

        await syncProductRating(product._id);
        res.status(201).json({ message: 'Review saved successfully', review });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'You have already reviewed this product' });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const numericRating = Number(rating);
        if (!numericRating || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        const review = await Review.findOne({
            _id: req.params.reviewId,
            product: req.params.id,
            user: req.user._id,
        });

        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        review.rating = numericRating;
        review.comment = String(comment || '').trim();
        await review.save();
        await syncProductRating(review.product);

        res.json({ message: 'Review updated successfully', review });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findOneAndDelete({
            _id: req.params.reviewId,
            product: req.params.id,
            user: req.user._id,
        });

        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        await syncProductRating(review.product);
        res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.syncProductRating = syncProductRating;