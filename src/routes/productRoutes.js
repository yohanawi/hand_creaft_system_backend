const express = require("express");
const router = express.Router();

const {
    createProduct,
    getProducts,
    getProductBySlug,
    updateProduct,
    deleteProduct,
    uploadProductImages,
} = require("../controllers/productController");
const reviewController = require('../controllers/reviewController');
const upload = require('../middlewares/upload');

const { protect, admin } = require("../middlewares/authMiddleware");

// Admin only
router.post('/upload-images', protect, admin, upload.array('images', 10), uploadProductImages);
router.post("/", protect, admin, createProduct);
router.put("/:id", protect, admin, updateProduct);
router.delete("/:id", protect, admin, deleteProduct);

// Public
router.get("/", getProducts);
router.get('/:id/reviews', reviewController.getProductReviews);
router.post('/:id/reviews', protect, reviewController.createOrUpdateReview);
router.put('/:id/reviews/:reviewId', protect, reviewController.updateReview);
router.delete('/:id/reviews/:reviewId', protect, reviewController.deleteReview);
router.get("/:slug", getProductBySlug);

module.exports = router;
