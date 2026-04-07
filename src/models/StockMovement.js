const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        sku: {
            type: String,
            default: '',
            trim: true,
        },
        productName: {
            type: String,
            default: '',
            trim: true,
        },
        type: {
            type: String,
            enum: [
                'opening_balance',
                'restock',
                'manual_adjustment',
                'order_reserved',
                'order_released',
                'cancellation_release',
                'payment_failure_release',
                'return_restock',
            ],
            required: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        note: {
            type: String,
            default: '',
            trim: true,
        },
        quantityChange: {
            type: Number,
            required: true,
        },
        previousQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        newQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        referenceType: {
            type: String,
            default: 'manual',
            trim: true,
        },
        referenceId: {
            type: String,
            default: '',
            trim: true,
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('StockMovement', stockMovementSchema);