const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { protect, optionalProtect } = require('../middlewares/authMiddleware');

router.post('/tickets', optionalProtect, supportController.createTicket);
router.get('/my', protect, supportController.getMyTickets);
router.get('/my/:id', protect, supportController.getMyTicketById);
router.post('/my/:id/messages', protect, supportController.replyToMyTicket);

module.exports = router;