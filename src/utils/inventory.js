const StockMovement = require('../models/StockMovement');

const getProductVariants = (product) => (
    Array.isArray(product?.variants) ? product.variants : []
);

const hasProductVariants = (product) => getProductVariants(product).length > 0;

const getVariantLabel = (variant = {}) => (
    String(
        variant.label
        || [variant.size, variant.color, variant.style]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join(' / ')
    ).trim()
);

const findProductVariant = (product, variantId) => {
    if (!variantId) {
        return null;
    }

    return getProductVariants(product).find(
        (variant) => String(variant._id) === String(variantId)
    ) || null;
};

const syncProductQuantity = (product) => {
    if (hasProductVariants(product)) {
        product.quantity = getProductVariants(product).reduce(
            (sum, variant) => sum + Number(variant.quantity || 0),
            0
        );
    }

    return Number(product.quantity || 0);
};

const getAvailableQuantity = (product, variantId = null) => {
    if (hasProductVariants(product)) {
        const variant = findProductVariant(product, variantId);
        return Number(variant?.quantity || 0);
    }

    return Number(product.quantity || 0);
};

const applyInventoryDelta = (product, quantityDelta, variantId = null) => {
    if (hasProductVariants(product)) {
        const variant = findProductVariant(product, variantId);
        if (!variant) {
            throw new Error('Product variant not found');
        }

        variant.quantity = Math.max(0, Number(variant.quantity || 0) + Number(quantityDelta || 0));
    } else {
        product.quantity = Math.max(0, Number(product.quantity || 0) + Number(quantityDelta || 0));
    }

    syncAvailabilityStatus(product);
};

const syncAvailabilityStatus = (product) => {
    const quantity = syncProductQuantity(product);

    if (quantity <= 0) {
        if (product.availabilityStatus !== 'pre_order') {
            product.availabilityStatus = 'out_of_stock';
        }
        return;
    }

    if (product.availabilityStatus === 'out_of_stock') {
        product.availabilityStatus = 'in_stock';
    }
};

const createStockMovement = async ({
    product,
    type,
    reason,
    note = '',
    quantityChange,
    previousQuantity,
    newQuantity,
    variant = null,
    referenceType = 'manual',
    referenceId = '',
    performedBy = null,
    metadata = {},
}) => StockMovement.create({
    product: product._id,
    sku: product.sku || '',
    productName: product.name || '',
    type,
    reason,
    note,
    quantityChange,
    previousQuantity,
    newQuantity,
    referenceType,
    referenceId,
    performedBy,
    metadata: {
        ...metadata,
        ...(variant
            ? {
                variantId: String(variant._id || ''),
                variantLabel: getVariantLabel(variant),
                variantSize: String(variant.size || ''),
                variantColor: String(variant.color || ''),
                variantStyle: String(variant.style || ''),
                variantSku: String(variant.sku || ''),
            }
            : {}),
    },
});

module.exports = {
    applyInventoryDelta,
    syncAvailabilityStatus,
    createStockMovement,
    findProductVariant,
    getAvailableQuantity,
    getVariantLabel,
    hasProductVariants,
    syncProductQuantity,
};