const mongoose = require('mongoose');

const orderItemVariantSchema = new mongoose.Schema({
    variantId: { type: String, default: '', trim: true },
    label: { type: String, default: '', trim: true },
    size: { type: String, default: '', trim: true },
    color: { type: String, default: '', trim: true },
    style: { type: String, default: '', trim: true },
    sku: { type: String, default: '', trim: true },
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    name: { type: String, required: true },
    thumbnailImage: { type: String, default: '' },
    price: { type: Number, required: true },
    salePrice: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 1 },
    sku: { type: String, default: '' },
    selectedVariant: {
        type: orderItemVariantSchema,
        default: () => ({}),
    },
});

const shippingAddressSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, default: '' },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'US' },
});

const trackingEventSchema = new mongoose.Schema({
    status: { type: String, required: true },
    message: { type: String, required: true },
    location: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        orderNumber: {
            type: String,
            unique: true,
        },

        items: [orderItemSchema],

        shippingAddress: shippingAddressSchema,

        paymentMethod: {
            type: String,
            enum: ['payhere', 'cod', 'card', 'paypal'],
            default: 'cod',
        },

        paymentGateway: {
            type: String,
            enum: ['none', 'payhere'],
            default: 'none',
        },

        paymentStatus: {
            type: String,
            enum: ['awaiting_payment', 'cod_due', 'paid', 'failed', 'cancelled', 'refunded'],
            default: 'cod_due',
        },

        // Order lifecycle status
        status: {
            type: String,
            enum: [
                'awaiting_payment',
                'payment_failed',
                'pending',        // order placed, awaiting confirmation
                'confirmed',      // admin confirmed the order
                'processing',     // being prepared / packed
                'shipped',        // dispatched with courier
                'out_for_delivery', // last mile
                'delivered',      // handed to customer
                'cancelled',      // cancelled
                'returned',       // return initiated
            ],
            default: 'pending',
        },

        // Tracking timeline
        trackingEvents: [trackingEventSchema],

        // Courier info (admin fills when shipping)
        trackingNumber: { type: String, default: '' },
        courier: { type: String, default: '' },
        estimatedDelivery: { type: Date, default: null },

        // Pricing
        subtotal: { type: Number, required: true },
        shippingCost: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        couponCode: { type: String, default: '' },
        total: { type: Number, required: true },

        inventoryReserved: {
            type: Boolean,
            default: false,
        },

        // Notes
        customerNote: { type: String, default: '' },
        adminNote: { type: String, default: '' },

        // Timestamps from status flow
        confirmedAt: { type: Date },
        paidAt: { type: Date },
        paymentFailedAt: { type: Date },
        refundedAt: { type: Date },
        shippedAt: { type: Date },
        deliveredAt: { type: Date },
        cancelledAt: { type: Date },

        paymentReference: { type: String, default: '' },
        gatewayTransactionId: { type: String, default: '' },
        paymentFailureReason: { type: String, default: '' },
        paymentInitiatedAt: { type: Date },
        paymentNotifiedAt: { type: Date },
        paymentSessionToken: { type: String, default: '' },
        paymentSessionExpiresAt: { type: Date, default: null },
        paymentReturnUrl: { type: String, default: '' },
        paymentCancelUrl: { type: String, default: '' },
        gatewayPayload: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Auto-generate order number before saving
orderSchema.pre('save', function (next) {
    if (!this.orderNumber) {
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.orderNumber = `HC-${ts}-${rand}`;
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);
