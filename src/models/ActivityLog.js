const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        userName: {
            type: String,
            required: true,
            trim: true,
        },
        action: {
            type: String,
            required: true,
            enum: ['create', 'update', 'delete', 'approve', 'reject', 'suspend', 'reactivate', 'login', 'logout'],
            index: true,
        },
        resourceType: {
            type: String,
            required: true,
            enum: ['user', 'product', 'order', 'category', 'subcategory', 'coupon', 'blog', 'support_ticket', 'seller_application', 'seller_payout', 'inventory'],
            index: true,
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            index: true,
        },
        resourceName: {
            type: String,
            default: '',
            trim: true,
        },
        changes: {
            before: mongoose.Schema.Types.Mixed,
            after: mongoose.Schema.Types.Mixed,
        },
        ipAddress: {
            type: String,
            default: '',
            trim: true,
        },
        userAgent: {
            type: String,
            default: '',
            trim: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: true }
);

activityLogSchema.index({ user: 1, timestamp: -1 });
activityLogSchema.index({ resourceType: 1, action: 1 });
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);