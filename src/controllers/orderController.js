const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const { calculateCouponDiscount } = require('./couponController');
const {
    applyInventoryDelta,
    createStockMovement,
    findProductVariant,
    getAvailableQuantity,
    getVariantLabel,
    hasProductVariants,
} = require('../utils/inventory');

const STATUS_MESSAGES = {
    awaiting_payment: 'Order created. Waiting for PayHere payment confirmation.',
    payment_failed: 'Payment failed. You can retry payment from your orders.',
    pending: 'Order placed successfully. Awaiting confirmation.',
    confirmed: 'Your order has been confirmed and will be prepared shortly.',
    processing: 'Your order is being packed and prepared for shipment.',
    shipped: 'Your order has been handed over to the courier.',
    out_for_delivery: 'Your order is out for delivery and will arrive today.',
    delivered: 'Your order has been delivered successfully. Enjoy!',
    cancelled: 'Your order has been cancelled.',
    returned: 'Return initiated for your order.',
};

const VALID_STATUS_FILTERS = [
    'awaiting_payment',
    'payment_failed',
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned',
];

const VALID_ADMIN_STATUSES = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned',
];

const VALID_PAYMENT_STATUSES = [
    'awaiting_payment',
    'cod_due',
    'paid',
    'failed',
    'cancelled',
    'refunded',
];

const STATUS_TRANSITIONS = {
    awaiting_payment: ['awaiting_payment', 'confirmed', 'payment_failed', 'cancelled'],
    payment_failed: ['payment_failed', 'awaiting_payment', 'cancelled'],
    pending: ['pending', 'confirmed', 'cancelled'],
    confirmed: ['confirmed', 'processing', 'cancelled'],
    processing: ['processing', 'shipped', 'cancelled'],
    shipped: ['shipped', 'out_for_delivery', 'delivered', 'returned'],
    out_for_delivery: ['out_for_delivery', 'delivered', 'returned'],
    delivered: ['delivered', 'returned'],
    cancelled: ['cancelled'],
    returned: ['returned'],
};

const normalizeShippingAddress = (address = {}) => {
    const normalized = {
        fullName: String(address.fullName || '').trim(),
        email: String(address.email || '').trim(),
        phone: String(address.phone || '').trim(),
        address: String(address.address || address.addressLine1 || '').trim(),
        city: String(address.city || '').trim(),
        state: String(address.state || '').trim(),
        zipCode: String(address.zipCode || '').trim(),
        country: String(address.country || 'US').trim(),
    };

    if (!normalized.fullName || !normalized.email || !normalized.phone || !normalized.address || !normalized.city || !normalized.zipCode) {
        return null;
    }

    return normalized;
};

const normalizeVariantSelection = (selection = {}) => ({
    variantId: String(selection.variantId || '').trim(),
    label: String(selection.label || '').trim(),
    size: String(selection.size || '').trim(),
    color: String(selection.color || '').trim(),
    style: String(selection.style || '').trim(),
    sku: String(selection.sku || '').trim(),
});

const resolveProductVariantSelection = (product, item = {}) => {
    const requestedVariantId = String(item.variantId || item.selectedVariant?.variantId || '').trim();

    if (!hasProductVariants(product)) {
        return {
            variant: null,
            selectedVariant: normalizeVariantSelection(),
        };
    }

    if (!requestedVariantId) {
        throw new Error(`A variant selection is required for "${product.name}"`);
    }

    const variant = findProductVariant(product, requestedVariantId);
    if (!variant) {
        throw new Error(`Selected variant for "${product.name}" was not found`);
    }

    return {
        variant,
        selectedVariant: normalizeVariantSelection({
            variantId: String(variant._id),
            label: getVariantLabel(variant),
            size: variant.size,
            color: variant.color,
            style: variant.style,
            sku: variant.sku,
        }),
    };
};

const resolvePricingSnapshot = (product, variant = null) => {
    const basePrice = Number(
        typeof variant?.price !== 'undefined' ? variant.price : product.price
    );
    const salePrice = typeof variant?.salePrice !== 'undefined' && variant.salePrice !== null
        ? Number(variant.salePrice)
        : typeof product.salePrice !== 'undefined' && product.salePrice !== null
            ? Number(product.salePrice)
            : null;

    const unitPrice = salePrice !== null && salePrice < basePrice ? salePrice : basePrice;

    return {
        price: basePrice,
        salePrice,
        unitPrice,
    };
};

const ensureRestorableVariant = (product, selectedVariant = {}) => {
    const variantId = String(selectedVariant?.variantId || '').trim();
    if (!variantId || !hasProductVariants(product)) {
        return {
            variantId,
            variant: variantId ? findProductVariant(product, variantId) : null,
        };
    }

    const existingVariant = findProductVariant(product, variantId);
    if (existingVariant) {
        return { variantId, variant: existingVariant };
    }

    product.variants.push({
        label: selectedVariant.label || 'Restored variant',
        size: selectedVariant.size || '',
        color: selectedVariant.color || '',
        style: selectedVariant.style || '',
        sku: selectedVariant.sku || '',
        quantity: 0,
        isDefault: false,
    });

    const recreatedVariant = product.variants[product.variants.length - 1];
    return {
        variantId: String(recreatedVariant._id),
        variant: recreatedVariant,
    };
};

const applyInventoryReduction = (product, quantity, variantId = '') => {
    applyInventoryDelta(product, Number(quantity || 0) * -1, variantId);
};

const applyInventoryRestore = (product, quantity, variantId = '') => {
    applyInventoryDelta(product, Number(quantity || 0), variantId);
};

const appendTrackingEvent = (order, status, message, location = '') => {
    order.trackingEvents.push({
        status,
        message: message || STATUS_MESSAGES[status] || `Status updated to ${status}`,
        location,
        timestamp: new Date(),
    });
};

const restoreInventoryForOrder = async (order) => {
    if (!order.inventoryReserved) {
        return;
    }

    for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (!product) continue;
        const previousQuantity = Number(product.quantity || 0);
        const { variantId, variant } = ensureRestorableVariant(product, item.selectedVariant);
        applyInventoryRestore(product, Number(item.quantity || 0), variantId);
        await product.save();
        await createStockMovement({
            product,
            type: order.status === 'returned' ? 'return_restock' : order.status === 'cancelled' ? 'cancellation_release' : 'order_released',
            reason: order.status === 'returned' ? 'Returned stock added back to inventory' : 'Reserved stock released back to inventory',
            note: `Order ${order.orderNumber}`,
            quantityChange: Number(item.quantity || 0),
            previousQuantity,
            newQuantity: Number(product.quantity || 0),
            variant,
            referenceType: 'order',
            referenceId: String(order._id),
            metadata: { orderNumber: order.orderNumber },
        });
    }

    if (order.couponCode) {
        const coupon = await Coupon.findOne({ code: order.couponCode });
        if (coupon && coupon.usedCount > 0) {
            coupon.usedCount -= 1;
            await coupon.save();
        }
    }

    order.inventoryReserved = false;
};

const serializeOrder = (order) => order.toObject();

const getPagingMeta = (page, limit, total) => {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
        total,
        page: Number(page),
        pages: totalPages,
        totalPages,
    };
};

const validateAdminStatusTransition = (currentStatus, nextStatus) => {
    const allowed = STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
};

exports.placeOrder = async (req, res) => {
    try {
        const {
            items,
            shippingAddress,
            addressId,
            paymentMethod,
            customerNote,
            couponCode,
            returnUrl,
            cancelUrl,
        } = req.body;

        const normalizedPaymentMethod = String(paymentMethod || 'cod').trim().toLowerCase();
        if (!['cod', 'payhere'].includes(normalizedPaymentMethod)) {
            return res.status(400).json({ message: 'Supported payment methods are cod and payhere' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Order must have at least one item' });
        }

        const user = await User.findById(req.user._id).select('email addresses');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let resolvedShippingAddress = null;
        if (addressId) {
            const savedAddress = user.addresses.id(addressId);
            if (!savedAddress) {
                return res.status(400).json({ message: 'Selected address not found' });
            }

            resolvedShippingAddress = normalizeShippingAddress({
                ...savedAddress.toObject(),
                email: user.email,
                address: savedAddress.addressLine1,
            });
        } else {
            resolvedShippingAddress = normalizeShippingAddress(shippingAddress);
        }

        if (!resolvedShippingAddress) {
            return res.status(400).json({ message: 'All shipping address fields are required' });
        }

        // Validate products & build items
        let subtotal = 0;
        const orderItems = [];
        const productsToUpdate = [];

        for (const item of items) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(400).json({ message: `Product ${item.product} not found` });
            }
            if (product.status !== 'active') {
                return res.status(400).json({ message: `Product "${product.name}" is not available` });
            }
            if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1) {
                return res.status(400).json({ message: `Invalid quantity for product "${product.name}"` });
            }
            const requestedQuantity = Number(item.quantity);

            let variant;
            let selectedVariant;
            try {
                ({ variant, selectedVariant } = resolveProductVariantSelection(product, item));
            } catch (error) {
                return res.status(400).json({ message: error.message });
            }

            if (getAvailableQuantity(product, selectedVariant.variantId) < requestedQuantity) {
                return res.status(400).json({
                    message: `Insufficient stock for "${product.name}"${selectedVariant.label ? ` (${selectedVariant.label})` : ''}`,
                });
            }

            const pricing = resolvePricingSnapshot(product, variant);
            const lineTotal = pricing.unitPrice * requestedQuantity;
            subtotal += lineTotal;

            orderItems.push({
                product: product._id,
                name: product.name,
                thumbnailImage: String(variant?.thumbnailImage || product.thumbnailImage || ''),
                price: pricing.price,
                salePrice: pricing.salePrice,
                quantity: requestedQuantity,
                sku: String(variant?.sku || product.sku || ''),
                selectedVariant,
            });

            const previousQuantity = Number(product.quantity || 0);
            applyInventoryReduction(product, requestedQuantity, selectedVariant.variantId);
            productsToUpdate.push({
                product,
                previousQuantity,
                reservedQuantity: requestedQuantity,
                variant,
                selectedVariant,
            });
        }

        const shippingCost = subtotal >= 100 ? 0 : 10;
        let discount = 0;
        let appliedCouponCode = '';

        if (couponCode) {
            const coupon = await Coupon.findOne({ code: String(couponCode).trim().toUpperCase() });
            if (!coupon) {
                return res.status(400).json({ message: 'Coupon not found' });
            }

            const couponResult = calculateCouponDiscount(coupon, subtotal);
            if (couponResult.error) {
                return res.status(400).json({ message: couponResult.error });
            }

            discount = couponResult.discount;
            appliedCouponCode = coupon.code;
            coupon.usedCount += 1;
            await coupon.save();
        }

        const taxableAmount = Math.max(0, subtotal - discount);
        const tax = parseFloat((taxableAmount * 0.1).toFixed(2));
        const total = parseFloat((taxableAmount + shippingCost + tax).toFixed(2));
        const isPayHereOrder = normalizedPaymentMethod === 'payhere';
        const initialStatus = isPayHereOrder ? 'awaiting_payment' : 'pending';
        const initialPaymentStatus = isPayHereOrder ? 'awaiting_payment' : 'cod_due';

        const order = await Order.create({
            user: req.user._id,
            items: orderItems,
            shippingAddress: resolvedShippingAddress,
            paymentMethod: normalizedPaymentMethod,
            paymentGateway: isPayHereOrder ? 'payhere' : 'none',
            paymentStatus: initialPaymentStatus,
            status: initialStatus,
            customerNote: customerNote || '',
            subtotal: parseFloat(subtotal.toFixed(2)),
            shippingCost,
            tax,
            discount,
            couponCode: appliedCouponCode,
            total,
            inventoryReserved: true,
            paymentReturnUrl: isPayHereOrder ? String(returnUrl).trim() : '',
            paymentCancelUrl: isPayHereOrder ? String(cancelUrl).trim() : '',
            trackingEvents: [
                {
                    status: initialStatus,
                    message: STATUS_MESSAGES[initialStatus],
                    location: '',
                    timestamp: new Date(),
                },
            ],
        });

        for (const entry of productsToUpdate) {
            await entry.product.save();
            await createStockMovement({
                product: entry.product,
                type: 'order_reserved',
                reason: 'Stock reserved for customer order',
                note: `Order ${order.orderNumber}`,
                quantityChange: entry.reservedQuantity * -1,
                previousQuantity: entry.previousQuantity,
                newQuantity: Number(entry.product.quantity || 0),
                variant: entry.variant,
                referenceType: 'order',
                referenceId: String(order._id),
                performedBy: req.user?._id || null,
                metadata: {
                    orderNumber: order.orderNumber,
                    selectedVariant: entry.selectedVariant,
                },
            });
        }

        res.status(201).json({
            message: isPayHereOrder ? 'Order created. Continue to PayHere to complete payment.' : 'Order placed successfully',
            order: serializeOrder(order),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMyOrders = async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const query = { user: req.user._id };
        if (status && VALID_STATUS_FILTERS.includes(String(status))) query.status = status;

        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate('items.product', 'name thumbnailImage slug');

        res.json({ orders, ...getPagingMeta(page, Number(limit), total) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMyOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).populate('items.product', 'name thumbnailImage slug');

        if (!order) return res.status(404).json({ message: 'Order not found' });

        res.json({ order: serializeOrder(order) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.trackOrder = async (req, res) => {
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber.toUpperCase(),
            user: req.user._id,
        }).select('-adminNote');

        if (!order) return res.status(404).json({ message: 'Order not found' });

        res.json({ order: serializeOrder(order) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.cancelMyOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (!['awaiting_payment', 'payment_failed', 'pending', 'confirmed'].includes(order.status)) {
            return res.status(400).json({
                message: `Cannot cancel order in "${order.status}" status`,
            });
        }

        order.status = 'cancelled';
        if (order.paymentMethod === 'payhere' && order.paymentStatus !== 'paid') {
            order.paymentStatus = 'cancelled';
        }
        order.cancelledAt = new Date();
        appendTrackingEvent(order, 'cancelled', 'Order cancelled by customer.');

        await restoreInventoryForOrder(order);

        await order.save();

        res.json({ message: 'Order cancelled', order: serializeOrder(order) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminGetOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search, paymentStatus } = req.query;
        const query = {};
        if (status && VALID_STATUS_FILTERS.includes(String(status))) query.status = status;
        if (paymentStatus && VALID_PAYMENT_STATUSES.includes(String(paymentStatus))) {
            query.paymentStatus = paymentStatus;
        }
        if (search) {
            query.$or = [
                { orderNumber: { $regex: search, $options: 'i' } },
                { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
            ];
        }

        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate('user', 'name email')
            .populate('items.product', 'name thumbnailImage');

        res.json({ orders, ...getPagingMeta(page, Number(limit), total) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminGetOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product', 'name thumbnailImage slug');

        if (!order) return res.status(404).json({ message: 'Order not found' });

        res.json({ order: serializeOrder(order) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminUpdateOrderStatus = async (req, res) => {
    try {
        const {
            status,
            paymentStatus,
            trackingNumber,
            courier,
            estimatedDelivery,
            adminNote,
            location,
            message,
        } = req.body;

        if (!VALID_ADMIN_STATUSES.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
            return res.status(400).json({ message: 'Invalid payment status value' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (!validateAdminStatusTransition(order.status, status)) {
            return res.status(400).json({
                message: `Cannot change order status from ${order.status} to ${status}`,
            });
        }

        order.status = status;

        if (typeof trackingNumber === 'string') order.trackingNumber = trackingNumber.trim();
        if (typeof courier === 'string') order.courier = courier.trim();
        if (estimatedDelivery) order.estimatedDelivery = new Date(estimatedDelivery);
        if (typeof adminNote === 'string') order.adminNote = adminNote;
        if (paymentStatus) order.paymentStatus = paymentStatus;

        if (status === 'confirmed') order.confirmedAt = new Date();
        if (status === 'shipped' && !order.shippedAt) order.shippedAt = new Date();
        if (status === 'processing' && order.paymentMethod === 'payhere' && order.paymentStatus !== 'paid') {
            return res.status(400).json({ message: 'Paid payment confirmation is required before processing a PayHere order' });
        }
        if (status === 'delivered') {
            order.deliveredAt = new Date();
            if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
                order.paymentStatus = 'paid';
                order.paidAt = order.paidAt || new Date();
            }
        }
        if (status === 'cancelled') {
            order.cancelledAt = new Date();
            if (order.paymentStatus !== 'paid') {
                order.paymentStatus = order.paymentMethod === 'payhere' ? 'cancelled' : order.paymentStatus;
            }
            await restoreInventoryForOrder(order);
        }
        if (status === 'returned') {
            if (order.paymentStatus === 'paid') {
                order.paymentStatus = paymentStatus || order.paymentStatus;
            }
            await restoreInventoryForOrder(order);
        }

        if (order.paymentStatus === 'paid' && !order.paidAt) {
            order.paidAt = new Date();
        }
        if (order.paymentStatus === 'refunded' && !order.refundedAt) {
            order.refundedAt = new Date();
        }
        if (order.paymentStatus === 'failed' && !order.paymentFailedAt) {
            order.paymentFailedAt = new Date();
        }

        appendTrackingEvent(order, status, message, location || '');

        await order.save();

        res.json({ message: 'Order status updated', order: serializeOrder(order) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminOrderStats = async (req, res) => {
    try {
        const [
            total,
            awaitingPayment,
            pending,
            confirmed,
            processing,
            shipped,
            delivered,
            cancelled,
            paid,
        ] =
            await Promise.all([
                Order.countDocuments(),
                Order.countDocuments({ status: 'awaiting_payment' }),
                Order.countDocuments({ status: 'pending' }),
                Order.countDocuments({ status: 'confirmed' }),
                Order.countDocuments({ status: 'processing' }),
                Order.countDocuments({ status: 'shipped' }),
                Order.countDocuments({ status: 'delivered' }),
                Order.countDocuments({ status: 'cancelled' }),
                Order.countDocuments({ paymentStatus: 'paid' }),
            ]);

        const revenueAgg = await Order.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, revenue: { $sum: '$total' } } },
        ]);
        const revenue = revenueAgg[0]?.revenue ?? 0;

        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email')
            .select('orderNumber status paymentStatus total createdAt');

        res.json({
            total,
            awaitingPayment,
            pending,
            confirmed,
            processing,
            shipped,
            delivered,
            cancelled,
            paid,
            revenue,
            recentOrders,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
