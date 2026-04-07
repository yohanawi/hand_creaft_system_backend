const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const paymentController = require('../controllers/paymentController');

router.post('/payhere/initiate', protect, paymentController.createPayHereSession);
router.post('/payhere/orders/:orderId/cancel', protect, paymentController.cancelPayHereOrder);
router.get('/payhere/checkout/:orderId', paymentController.renderPayHereCheckout);
router.post('/payhere/notify', paymentController.handlePayHereNotify);

module.exports = router;