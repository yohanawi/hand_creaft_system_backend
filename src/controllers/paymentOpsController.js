const Order = require('../models/Order');

const sumTotals = async (match) => {
    const result = await Order.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    return Number(result[0]?.total || 0);
};

exports.getPaymentOverview = async (req, res) => {
    try {
        const [
            awaitingPaymentCount,
            codDueCount,
            paidCount,
            failedCount,
            refundedCount,
            cancelledCount,
            pendingGatewayAmount,
            codOutstandingAmount,
            paidRevenue,
            refundedAmount,
            paidByMethod,
            recentPaid,
            recentIssues,
            reconciliation,
        ] = await Promise.all([
            Order.countDocuments({ paymentStatus: 'awaiting_payment' }),
            Order.countDocuments({ paymentStatus: 'cod_due' }),
            Order.countDocuments({ paymentStatus: 'paid' }),
            Order.countDocuments({ paymentStatus: 'failed' }),
            Order.countDocuments({ paymentStatus: 'refunded' }),
            Order.countDocuments({ paymentStatus: 'cancelled' }),
            sumTotals({ paymentStatus: 'awaiting_payment' }),
            sumTotals({ paymentMethod: 'cod', paymentStatus: 'cod_due', status: { $nin: ['cancelled', 'returned'] } }),
            sumTotals({ paymentStatus: 'paid' }),
            sumTotals({ paymentStatus: 'refunded' }),
            Order.aggregate([
                { $match: { paymentStatus: 'paid' } },
                { $group: { _id: '$paymentMethod', total: { $sum: '$total' }, count: { $sum: 1 } } },
            ]),
            Order.find({ paymentStatus: 'paid' })
                .sort({ paidAt: -1, updatedAt: -1 })
                .limit(8)
                .populate('user', 'name email')
                .select('orderNumber total status paymentMethod paymentStatus paidAt updatedAt'),
            Order.find({ paymentStatus: { $in: ['awaiting_payment', 'failed', 'refunded', 'cancelled'] } })
                .sort({ updatedAt: -1 })
                .limit(10)
                .populate('user', 'name email')
                .select('orderNumber total status paymentMethod paymentStatus paymentFailureReason updatedAt'),
            Promise.all([
                Order.countDocuments({ paymentStatus: 'paid', status: 'delivered' }),
                Order.countDocuments({ paymentStatus: 'paid', status: { $nin: ['delivered', 'cancelled', 'returned'] } }),
                Order.countDocuments({ paymentMethod: 'cod', paymentStatus: 'cod_due', status: 'delivered' }),
                Order.countDocuments({ paymentMethod: 'payhere', paymentStatus: 'awaiting_payment' }),
            ]),
        ]);

        res.json({
            stats: {
                awaitingPaymentCount,
                codDueCount,
                paidCount,
                failedCount,
                refundedCount,
                cancelledCount,
                pendingGatewayAmount,
                codOutstandingAmount,
                paidRevenue,
                refundedAmount,
            },
            paidByMethod: paidByMethod.map((row) => ({
                paymentMethod: row._id,
                total: row.total,
                count: row.count,
            })),
            recentPaid,
            recentIssues,
            reconciliation: {
                deliveredAndPaidCount: reconciliation[0],
                paidAwaitingFulfillmentCount: reconciliation[1],
                deliveredButUncollectedCodCount: reconciliation[2],
                pendingGatewayOrderCount: reconciliation[3],
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};