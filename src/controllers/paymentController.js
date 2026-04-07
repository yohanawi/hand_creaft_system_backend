const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const {
    applyInventoryDelta,
    createStockMovement,
    findProductVariant,
} = require('../utils/inventory');

const PAYHERE_SANDBOX_URL = 'https://sandbox.payhere.lk/pay/checkout';
const PAYHERE_LIVE_URL = 'https://www.payhere.lk/pay/checkout';

const STATUS_MESSAGES = {
    awaiting_payment: 'Order created. Waiting for PayHere payment confirmation.',
    payment_failed: 'Payment was not completed. You can retry payment from your orders.',
    confirmed: 'Payment received and order confirmed.',
    cancelled: 'Order cancelled before payment completion.',
};

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatAmount = (amount) => Number(amount || 0).toFixed(2);

const getPayHereCheckoutUrl = () => (
    String(process.env.PAYHERE_SANDBOX || 'true').toLowerCase() === 'false'
        ? PAYHERE_LIVE_URL
        : PAYHERE_SANDBOX_URL
);

const getMerchantHash = () => crypto
    .createHash('md5')
    .update(String(process.env.PAYHERE_MERCHANT_SECRET || ''))
    .digest('hex')
    .toUpperCase();

const buildCheckoutHash = ({ merchantId, orderId, amount, currency }) => crypto
    .createHash('md5')
    .update(`${merchantId}${orderId}${formatAmount(amount)}${currency}${getMerchantHash()}`)
    .digest('hex')
    .toUpperCase();

const buildNotifyHash = ({ merchantId, orderId, amount, currency, statusCode }) => crypto
    .createHash('md5')
    .update(`${merchantId}${orderId}${formatAmount(amount)}${currency}${statusCode}${getMerchantHash()}`)
    .digest('hex')
    .toUpperCase();

const ensurePayHereConfigured = () => {
    const missing = [
        'PAYHERE_MERCHANT_ID',
        'PAYHERE_MERCHANT_SECRET',
        'PAYHERE_NOTIFY_URL',
    ].filter((key) => !process.env[key]);

    if (missing.length > 0) {
        return `Missing PayHere configuration: ${missing.join(', ')}`;
    }

    return null;
};

const appendTrackingEvent = (order, status, message, location = '') => {
    order.trackingEvents.push({
        status,
        message,
        location,
        timestamp: new Date(),
    });
};

const ensureRestorableVariant = (product, selectedVariant = {}) => {
    const variantId = String(selectedVariant?.variantId || '').trim();
    if (!variantId || !Array.isArray(product?.variants) || product.variants.length === 0) {
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

const restoreInventory = async (order) => {
    if (!order.inventoryReserved) {
        return;
    }

    for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (!product) continue;
        const previousQuantity = Number(product.quantity || 0);
        const { variantId, variant } = ensureRestorableVariant(product, item.selectedVariant);
        applyInventoryDelta(product, Number(item.quantity || 0), variantId);
        await product.save();
        await createStockMovement({
            product,
            type: 'payment_failure_release',
            reason: 'Stock released after payment failure or cancellation',
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

const createPaymentSessionToken = () => crypto.randomBytes(24).toString('hex');

const getOrderOwnerFilter = (req, orderId) => ({
    _id: orderId,
    user: req.user._id,
});

const buildPayHereFormFields = (order) => {
    const merchantId = String(process.env.PAYHERE_MERCHANT_ID || '');
    const currency = String(process.env.PAYHERE_CURRENCY || 'LKR').toUpperCase();
    const amount = formatAmount(order.total);
    const [firstName, ...restName] = String(order.shippingAddress.fullName || '').trim().split(/\s+/);
    const lastName = restName.join(' ') || '-';

    return {
        merchant_id: merchantId,
        return_url: order.paymentReturnUrl,
        cancel_url: order.paymentCancelUrl,
        notify_url: String(process.env.PAYHERE_NOTIFY_URL || ''),
        order_id: order.orderNumber,
        items: `Order ${order.orderNumber}`,
        currency,
        amount,
        first_name: firstName || order.shippingAddress.fullName,
        last_name: lastName,
        email: order.shippingAddress.email,
        phone: order.shippingAddress.phone,
        address: order.shippingAddress.address,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        delivery_address: order.shippingAddress.address,
        delivery_city: order.shippingAddress.city,
        delivery_country: order.shippingAddress.country,
        custom_1: String(order._id),
        custom_2: String(order.user),
        hash: buildCheckoutHash({
            merchantId,
            orderId: order.orderNumber,
            amount,
            currency,
        }),
    };
};

const buildCheckoutHtml = (order) => {
    const formFields = buildPayHereFormFields(order);
    const inputs = Object.entries(formFields)
        .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
        .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to PayHere</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f7f3ef; color: #2c1810; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #fff; border-radius: 16px; padding: 32px; width: min(92vw, 480px); box-shadow: 0 12px 40px rgba(44, 24, 16, 0.12); text-align: center; }
    .spinner { width: 42px; height: 42px; border: 4px solid #eadfd6; border-top-color: #c1622f; border-radius: 50%; margin: 0 auto 18px; animation: spin 1s linear infinite; }
    button { background: #c1622f; color: #fff; border: 0; border-radius: 999px; padding: 12px 20px; font-weight: 700; cursor: pointer; }
    p { color: #6f6054; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Redirecting to PayHere</h1>
    <p>Your order ${escapeHtml(order.orderNumber)} is ready for secure payment.</p>
    <form id="payhere-form" method="post" action="${escapeHtml(getPayHereCheckoutUrl())}">
      ${inputs}
      <button type="submit">Continue to PayHere</button>
    </form>
  </div>
  <script>window.setTimeout(function(){document.getElementById('payhere-form').submit();}, 300);</script>
</body>
</html>`;
};

exports.createPayHereSession = async (req, res) => {
    try {
        const configError = ensurePayHereConfigured();
        if (configError) {
            return res.status(500).json({ message: configError });
        }

        const { orderId, returnUrl, cancelUrl } = req.body;
        if (!orderId || !returnUrl || !cancelUrl) {
            return res.status(400).json({ message: 'orderId, returnUrl, and cancelUrl are required' });
        }

        const order = await Order.findOne(getOrderOwnerFilter(req, orderId));
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.paymentMethod !== 'payhere') {
            return res.status(400).json({ message: 'Order is not configured for PayHere payment' });
        }

        if (!['awaiting_payment', 'payment_failed'].includes(order.status)) {
            return res.status(400).json({ message: `Cannot start payment for an order in ${order.status} status` });
        }

        order.paymentGateway = 'payhere';
        order.paymentStatus = 'awaiting_payment';
        order.status = 'awaiting_payment';
        order.paymentFailureReason = '';
        order.paymentInitiatedAt = new Date();
        order.paymentSessionToken = createPaymentSessionToken();
        order.paymentSessionExpiresAt = new Date(Date.now() + 1000 * 60 * 30);
        order.paymentReturnUrl = String(returnUrl).trim();
        order.paymentCancelUrl = String(cancelUrl).trim();

        appendTrackingEvent(order, 'awaiting_payment', STATUS_MESSAGES.awaiting_payment);
        await order.save();

        const checkoutUrl = `${req.protocol}://${req.get('host')}/api/payments/payhere/checkout/${order._id}?token=${order.paymentSessionToken}`;

        res.json({
            message: 'PayHere payment session created',
            order: order.toObject(),
            checkoutUrl,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.renderPayHereCheckout = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) {
            return res.status(404).send('Order not found');
        }

        if (!order.paymentSessionToken || req.query.token !== order.paymentSessionToken) {
            return res.status(403).send('Invalid payment session');
        }

        if (order.paymentSessionExpiresAt && order.paymentSessionExpiresAt.getTime() < Date.now()) {
            return res.status(410).send('Payment session expired');
        }

        if (!['awaiting_payment', 'payment_failed'].includes(order.status)) {
            return res.status(400).send('Order is no longer payable');
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(buildCheckoutHtml(order));
    } catch (error) {
        res.status(500).send(error.message);
    }
};

exports.handlePayHereNotify = async (req, res) => {
    try {
        const {
            merchant_id: merchantId,
            order_id: orderId,
            payhere_amount: payhereAmount,
            payhere_currency: payhereCurrency,
            status_code: statusCode,
            md5sig,
            payment_id: paymentId,
            custom_1: orderMongoId,
        } = req.body;

        const configError = ensurePayHereConfigured();
        if (configError) {
            return res.status(500).send(configError);
        }

        const expectedSig = buildNotifyHash({
            merchantId,
            orderId,
            amount: payhereAmount,
            currency: String(payhereCurrency || '').toUpperCase(),
            statusCode,
        });

        if (expectedSig !== String(md5sig || '').toUpperCase()) {
            return res.status(400).send('Invalid signature');
        }

        const order = await Order.findOne({
            _id: orderMongoId,
            orderNumber: orderId,
        });

        if (!order) {
            return res.status(404).send('Order not found');
        }

        if (order.paymentStatus === 'paid' && order.gatewayTransactionId === String(paymentId || '')) {
            return res.status(200).send('OK');
        }

        order.gatewayPayload = req.body;
        order.paymentReference = String(paymentId || '');
        order.gatewayTransactionId = String(paymentId || '');
        order.paymentNotifiedAt = new Date();

        if (String(statusCode) === '2') {
            order.paymentStatus = 'paid';
            order.paidAt = new Date();
            order.paymentFailureReason = '';
            if (order.status !== 'cancelled') {
                order.status = 'confirmed';
                order.confirmedAt = order.confirmedAt || new Date();
                appendTrackingEvent(order, 'confirmed', STATUS_MESSAGES.confirmed);
            } else {
                order.paymentFailureReason = 'Payment received after cancellation. Manual refund review required.';
            }
        } else {
            order.paymentStatus = 'failed';
            order.status = 'payment_failed';
            order.paymentFailedAt = new Date();
            order.paymentFailureReason = String(req.body.status_message || 'Payment failed');
            appendTrackingEvent(order, 'payment_failed', STATUS_MESSAGES.payment_failed);
            await restoreInventory(order);
        }

        await order.save();
        return res.status(200).send('OK');
    } catch (error) {
        return res.status(500).send(error.message);
    }
};

exports.cancelPayHereOrder = async (req, res) => {
    try {
        const order = await Order.findOne(getOrderOwnerFilter(req, req.params.orderId));
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.paymentMethod !== 'payhere') {
            return res.status(400).json({ message: 'Order is not a PayHere order' });
        }

        if (!['awaiting_payment', 'payment_failed'].includes(order.status)) {
            return res.status(400).json({ message: `Cannot cancel order in ${order.status} status` });
        }

        order.status = 'cancelled';
        order.paymentStatus = 'cancelled';
        order.cancelledAt = new Date();
        appendTrackingEvent(order, 'cancelled', STATUS_MESSAGES.cancelled);
        await restoreInventory(order);
        await order.save();

        res.json({ message: 'Order cancelled', order: order.toObject() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};