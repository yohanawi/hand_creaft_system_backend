const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema(
    {
        senderType: {
            type: String,
            enum: ['customer', 'admin', 'system'],
            required: true,
        },
        senderUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        senderName: {
            type: String,
            default: '',
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
    {
        ticketNumber: {
            type: String,
            unique: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        customerName: {
            type: String,
            required: true,
            trim: true,
        },
        customerEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        customerPhone: {
            type: String,
            default: '',
            trim: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            enum: ['order', 'payment', 'shipping', 'product', 'technical', 'account', 'general'],
            default: 'general',
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
        },
        status: {
            type: String,
            enum: ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'],
            default: 'open',
        },
        source: {
            type: String,
            enum: ['contact_form', 'profile', 'order_help', 'admin_created'],
            default: 'contact_form',
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
        },
        adminAssignee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        tags: {
            type: [String],
            default: [],
        },
        messages: {
            type: [ticketMessageSchema],
            default: [],
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
        lastCustomerReplyAt: {
            type: Date,
            default: Date.now,
        },
        lastAdminReplyAt: {
            type: Date,
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        closedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

supportTicketSchema.pre('save', function (next) {
    if (!this.ticketNumber) {
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        this.ticketNumber = `SUP-${ts}-${rand}`;
    }
    next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);