const express = require('express');
const router = express.Router();

const upload = require('../middlewares/upload');
const { protect, seller } = require('../middlewares/authMiddleware');
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const sellerController = require('../controllers/sellerController');

router.use(protect, seller);

router.get('/overview', sellerController.getSellerOverview);
router.get('/analytics', sellerController.getSellerAnalytics);
router.get('/profile', sellerController.getSellerProfile);
router.put('/profile', sellerController.updateSellerProfile);

router.get('/products', productController.getSellerProducts);
router.post('/products/upload-images', upload.array('images', 10), productController.uploadProductImages);
router.post('/products', productController.createProduct);
router.post('/products/bulk-status', productController.bulkUpdateSellerProducts);
router.post('/products/:id/duplicate', productController.duplicateSellerProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

router.get('/inventory/overview', sellerController.getSellerInventoryOverview);
router.get('/inventory/movements', sellerController.getSellerInventoryMovements);
router.post('/inventory/products/:id/restock', sellerController.restockSellerProduct);
router.post('/inventory/products/:id/adjust', sellerController.adjustSellerProductStock);
router.put('/inventory/products/:id/threshold', sellerController.updateSellerLowStockThreshold);

router.get('/orders', orderController.sellerGetOrders);
router.get('/orders/:id', orderController.sellerGetOrderById);
router.put('/orders/:id/status', orderController.sellerUpdateOrderStatus);

router.get('/payouts/overview', sellerController.getSellerPayoutOverview);
router.post('/payouts/request', sellerController.requestSellerPayout);

module.exports = router;