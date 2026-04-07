const express = require('express');

const router = express.Router();
const { validateCouponCode } = require('../controllers/couponController');

router.post('/validate', validateCouponCode);

module.exports = router;