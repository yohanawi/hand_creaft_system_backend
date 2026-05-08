const mongoose = require('mongoose');

const payoutAllocationSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },
    itemIndex: {
        type: Number,
        required: true,
        min: 0,
    },
    grossAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    sellerNetAmount: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: false });

const sellerPayoutSchema = new mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        default: 'USD',
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'paid', 'rejected'],
        default: 'pending',
    },
    note: {
        type: String,
        default: '',
        trim: true,
    },
    bankReference: {
        type: String,
        default: '',
        trim: true,
    },
    requestedAt: {
        type: Date,
        default: Date.now,
    },
    processedAt: {
        type: Date,
        default: null,
    },
    allocations: {
        type: [payoutAllocationSchema],
        default: [],
    },
}, { timestamps: true });

module.exports = mongoose.model('SellerPayout', sellerPayoutSchema);