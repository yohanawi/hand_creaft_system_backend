const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const adminController = require('../controllers/adminController');
const orderController = require('../controllers/orderController');
const couponController = require('../controllers/couponController');
const inventoryController = require('../controllers/inventoryController');
const paymentOpsController = require('../controllers/paymentOpsController');
const supportController = require('../controllers/supportController');
const wishlistController = require('../controllers/wishlistController');

// All admin routes require authentication + admin role
router.use(protect, admin);

router.get('/stats', adminController.getDashboardStats);
router.get('/inventory/overview', inventoryController.getInventoryOverview);
router.get('/inventory/movements', inventoryController.getStockMovements);
router.post('/inventory/products/:id/restock', inventoryController.restockProduct);
router.post('/inventory/products/:id/adjust', inventoryController.adjustProductStock);
router.get('/payments/overview', paymentOpsController.getPaymentOverview);
router.get('/support/tickets', supportController.adminGetTickets);
router.get('/support/tickets/stats', supportController.adminTicketStats);
router.get('/support/tickets/:id', supportController.adminGetTicketById);
router.put('/support/tickets/:id', supportController.adminUpdateTicket);
router.post('/support/tickets/:id/reply', supportController.adminReplyToTicket);
router.get('/wishlist/insights', wishlistController.adminGetWishlistInsights);
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

router.get('/coupons', couponController.getCoupons);
router.post('/coupons', couponController.createCoupon);
router.put('/coupons/:id', couponController.updateCoupon);
router.delete('/coupons/:id', couponController.deleteCoupon);

// Order management
router.get('/orders', orderController.adminGetOrders);
router.get('/orders/stats', orderController.adminOrderStats);
router.get('/orders/:id', orderController.adminGetOrderById);
router.put('/orders/:id/status', orderController.adminUpdateOrderStatus);

module.exports = router;
