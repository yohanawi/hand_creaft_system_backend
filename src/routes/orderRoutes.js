const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
    placeOrder,
    getMyOrders,
    getMyOrderById,
    trackOrder,
    cancelMyOrder,
} = require('../controllers/orderController');

// All user order routes require authentication
router.use(protect);

router.post('/', placeOrder);
router.get('/my', getMyOrders);
router.get('/my/:id', getMyOrderById);
router.get('/track/:orderNumber', trackOrder);
router.patch('/my/:id/cancel', cancelMyOrder);

module.exports = router;
