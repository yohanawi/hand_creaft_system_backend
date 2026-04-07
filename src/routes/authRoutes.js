const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
	register,
	login,
	getMe,
	updateMe,
	changePassword,
	forgotPassword,
	resetPassword,
	getAddresses,
	addAddress,
	updateAddress,
	deleteAddress,
	setDefaultAddress,
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.put('/change-password', protect, changePassword);

router.get('/addresses', protect, getAddresses);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:id', protect, updateAddress);
router.delete('/addresses/:id', protect, deleteAddress);
router.patch('/addresses/:id/default', protect, setDefaultAddress);

module.exports = router;
