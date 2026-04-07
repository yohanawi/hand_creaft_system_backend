const User = require('../models/User');
const Product = require('../models/Product');
const {
    findProductVariant,
    getAvailableQuantity,
    getVariantLabel,
    hasProductVariants,
} = require('../utils/inventory');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const populatedCart = (userId) =>
    User.findById(userId)
        .populate('cart.product', 'name thumbnailImage price salePrice sku availabilityStatus quantity')
        .then((u) => u.cart || []);

const normalizeVariantId = (value) => String(value || '').trim();

const buildSelectedVariant = (product, variantId = '') => {
    if (!hasProductVariants(product)) {
        return {
            variantId: '',
            label: '',
            size: '',
            color: '',
            style: '',
            sku: '',
        };
    }

    const variant = findProductVariant(product, variantId);
    if (!variant) {
        return null;
    }

    return {
        variantId: String(variant._id),
        label: getVariantLabel(variant),
        size: String(variant.size || ''),
        color: String(variant.color || ''),
        style: String(variant.style || ''),
        sku: String(variant.sku || ''),
    };
};

const findCartIndex = (cart, productId, variantId = '') => cart.findIndex((item) => (
    item.product.toString() === String(productId)
    && String(item.selectedVariant?.variantId || '') === String(variantId || '')
));

const resolveCartPricing = (product, variant = null) => {
    const price = Number(typeof variant?.price !== 'undefined' ? variant.price : product.price);
    const salePrice = typeof variant?.salePrice !== 'undefined' && variant.salePrice !== null
        ? Number(variant.salePrice)
        : typeof product.salePrice !== 'undefined' && product.salePrice !== null
            ? Number(product.salePrice)
            : null;

    return {
        price,
        salePrice,
    };
};

// ─── GET /cart ────────────────────────────────────────────────────────────────
exports.getCart = async (req, res) => {
    try {
        const cart = await populatedCart(req.user._id);
        res.json(cart);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── POST /cart  (add item or increment qty) ──────────────────────────────────
exports.addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1, variantId: rawVariantId } = req.body;
        const variantId = normalizeVariantId(rawVariantId);
        if (!productId) return res.status(400).json({ message: 'productId is required' });

        const requestedQuantity = Number(quantity);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
            return res.status(400).json({ message: 'Valid quantity is required' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        if (product.status !== 'active') return res.status(400).json({ message: 'Product is not available' });

        const selectedVariant = buildSelectedVariant(product, variantId);
        if (hasProductVariants(product) && !selectedVariant) {
            return res.status(400).json({ message: 'A valid variant selection is required for this product' });
        }

        const variant = selectedVariant?.variantId
            ? findProductVariant(product, selectedVariant.variantId)
            : null;
        const pricing = resolveCartPricing(product, variant);
        const thumbnailImage = String(variant?.thumbnailImage || product.thumbnailImage || '');
        const sku = String(variant?.sku || product.sku || '');

        const user = await User.findById(req.user._id);
        const idx = findCartIndex(user.cart, productId, variantId);
        const existingQuantity = idx !== -1 ? Number(user.cart[idx].quantity || 0) : 0;
        const availableQuantity = getAvailableQuantity(product, variantId);
        if (availableQuantity < existingQuantity + requestedQuantity) {
            return res.status(400).json({ message: `Only ${availableQuantity} item(s) available for this selection` });
        }

        if (idx !== -1) {
            user.cart[idx].quantity += requestedQuantity;
            user.cart[idx].name = product.name;
            user.cart[idx].thumbnailImage = thumbnailImage;
            user.cart[idx].price = pricing.price;
            user.cart[idx].salePrice = pricing.salePrice;
            user.cart[idx].sku = sku;
            user.cart[idx].selectedVariant = selectedVariant;
        } else {
            user.cart.push({
                product: productId,
                quantity: requestedQuantity,
                name: product.name,
                thumbnailImage,
                price: pricing.price,
                salePrice: pricing.salePrice,
                sku,
                selectedVariant,
            });
        }
        await user.save();

        res.json(await populatedCart(req.user._id));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PUT /cart/:productId  (set exact qty) ────────────────────────────────────
exports.updateCartItem = async (req, res) => {
    try {
        const qty = Number(req.body.quantity);
        const variantId = normalizeVariantId(req.body.variantId);
        if (!qty || qty < 1) return res.status(400).json({ message: 'Valid quantity required' });

        const user = await User.findById(req.user._id);
        const idx = findCartIndex(user.cart, req.params.productId, variantId);
        if (idx === -1) return res.status(404).json({ message: 'Item not in cart' });

        const product = await Product.findById(req.params.productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const availableQuantity = getAvailableQuantity(product, variantId);
        if (availableQuantity < qty) {
            return res.status(400).json({ message: `Only ${availableQuantity} item(s) available for this selection` });
        }

        user.cart[idx].quantity = qty;
        await user.save();

        res.json(await populatedCart(req.user._id));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE /cart/:productId ──────────────────────────────────────────────────
exports.removeFromCart = async (req, res) => {
    try {
        const variantId = normalizeVariantId(req.query.variantId || req.body?.variantId);
        const user = await User.findById(req.user._id);
        user.cart = user.cart.filter((item) => !(
            item.product.toString() === req.params.productId
            && String(item.selectedVariant?.variantId || '') === variantId
        ));
        await user.save();

        res.json(await populatedCart(req.user._id));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE /cart  (clear all) ────────────────────────────────────────────────
exports.clearCart = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { cart: [] });
        res.json([]);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
