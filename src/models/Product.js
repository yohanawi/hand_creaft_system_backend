const mongoose = require("mongoose");
const slugify = require("slugify");

const productVariantSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            default: "",
            trim: true,
        },
        size: {
            type: String,
            default: "",
            trim: true,
        },
        color: {
            type: String,
            default: "",
            trim: true,
        },
        style: {
            type: String, 
            default: "",
            trim: true,
        },
        sku: {
            type: String,
            default: "",
            trim: true,
        },
        quantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        price: {
            type: Number,
            min: 0,
        },
        salePrice: {
            type: Number,
            min: 0,
        },
        thumbnailImage: {
            type: String,
            default: "",
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    { _id: true }
);

const deliveryEstimateSchema = new mongoose.Schema(
    {
        minDays: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxDays: {
            type: Number,
            default: 0,
            min: 0,
        },
        label: {
            type: String,
            default: "",
            trim: true,
        },
        shipsFrom: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { _id: false }
);

const richMediaSchema = new mongoose.Schema(
    {
        videos: {
            type: [String],
            default: [],
        },
        view360Images: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const policySurfaceSchema = new mongoose.Schema(
    {
        returnPolicy: {
            type: String,
            default: "",
            trim: true,
        },
        warrantyPolicy: {
            type: String,
            default: "",
            trim: true,
        },
        shippingPolicy: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        slug: {
            type: String,
            unique: true,
        },

        thumbnailImage: {
            type: String,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        salePrice: {
            type: Number,
            min: 0,
        },

        currency: {
            type: String,
            default: "USD",
            trim: true,
        },

        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },

        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },

        sellerShopName: {
            type: String,
            default: '',
            trim: true,
        },

        sellerVisibilityBlocked: {
            type: Boolean,
            default: false,
        },

        subcategory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subcategory",
            default: null,
        },

        quantity: {
            type: Number,
            default: 0,
            min: 0,
        },

        description: {
            type: String,
        },

        color: {
            type: String,
        },

        variants: {
            type: [productVariantSchema],
            default: [],
        },

        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
        },

        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },

        archivedAt: {
            type: Date,
            default: null,
        },

        isFeatured: {
            type: Boolean,
            default: false,
        },

        images: {
            type: [String],
            default: [],
        },

        weight: {
            type: Number,
            min: 0,
        },

        tags: {
            type: [String],
            default: [],
        },

        sku: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        availabilityStatus: {
            type: String,
            enum: ["in_stock", "out_of_stock", "pre_order"],
            default: "in_stock",
        },

        material: {
            type: String,
        },

        // AI feature vector — 1280-dim MobileNetV2 embedding
        features: {
            type: [Number],
            default: [],
            select: false, // never returned in normal queries (big array)
        },

        featuresIndexed: {
            type: Boolean,
            default: false,
        },

        featuresImageSignature: {
            type: String,
            default: "",
            trim: true,
        },

        averageRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        reviewCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        lowStockThreshold: {
            type: Number,
            default: 5,
            min: 0,
        },

        deliveryEstimate: {
            type: deliveryEstimateSchema,
            default: () => ({}),
        },

        richMedia: {
            type: richMediaSchema,
            default: () => ({}),
        },

        policySurfaces: {
            type: policySurfaceSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

function syncArchiveState(product) {
    const status = String(product.status || '').trim();
    const statusWasChanged = typeof product.isModified === 'function' ? product.isModified('status') : false;

    if (status === 'archived') {
        product.isArchived = true;
        product.archivedAt = product.archivedAt || new Date();
        product.isFeatured = false;
        return;
    }

    if (!statusWasChanged && typeof product.isModified === 'function' && product.isModified('isArchived') && product.isArchived === true) {
        product.status = 'archived';
        product.archivedAt = product.archivedAt || new Date();
        product.isFeatured = false;
        return;
    }

    product.isArchived = false;
    product.archivedAt = null;
}

productSchema.pre("validate", function () {
    syncArchiveState(this);

    if (Array.isArray(this.variants) && this.variants.length > 0) {
        let defaultSeen = false;

        this.variants.forEach((variant, index) => {
            if (!variant.label) {
                variant.label = [variant.size, variant.color, variant.style]
                    .map((value) => String(value || "").trim())
                    .filter(Boolean)
                    .join(" / ");
            }

            if (variant.isDefault && !defaultSeen) {
                defaultSeen = true;
            } else if (variant.isDefault) {
                variant.isDefault = false;
            }

            if (index === 0 && !defaultSeen) {
                variant.isDefault = true;
                defaultSeen = true;
            }
        });

        this.quantity = this.variants.reduce(
            (sum, variant) => sum + Number(variant.quantity || 0),
            0
        );
    }

});

function getCurrentAiImageSignature(product) {
    const thumbnailImage = String(product?.thumbnailImage || '').trim();
    if (thumbnailImage) {
        return thumbnailImage;
    }

    if (Array.isArray(product?.images) && product.images.length > 0) {
        return String(product.images[0] || '').trim();
    }

    return '';
}

productSchema.pre("save", function () {
    const imageChanged = this.isModified("thumbnailImage") || this.isModified("images");
    const activationChanged = this.isModified("status") || this.isModified("isArchived");
    const hasImage = Boolean(getCurrentAiImageSignature(this));
    const isEligible = this.status === 'active' && this.isArchived !== true;

    this.$locals = this.$locals || {};
    this.$locals.aiShouldRefresh = false;
    this.$locals.aiRefreshReason = 'catalog-update';

    if (imageChanged) {
        this.features = [];
        this.featuresIndexed = false;
        this.featuresImageSignature = '';
        this.$locals.aiRefreshReason = 'image-updated';
    }

    if ((this.isNew || imageChanged || activationChanged) && isEligible && hasImage) {
        this.$locals.aiShouldRefresh = true;

        if (this.isNew) {
            this.$locals.aiRefreshReason = 'product-created';
        } else if (activationChanged && !imageChanged) {
            this.$locals.aiRefreshReason = 'product-activated';
        }
    }
});

productSchema.pre("save", function () {
    if (!this.slug) {
        this.slug = slugify(this.name, { lower: true });
    }
});

productSchema.post("save", function (doc) {
    if (!doc?.$locals?.aiShouldRefresh) {
        return;
    }

    try {
        const { queueProductAiRefresh } = require("../utils/aiSearch");
        queueProductAiRefresh(doc._id, doc.$locals.aiRefreshReason || 'catalog-update');
    } catch (error) {
        console.error(`AI auto-refresh queue failed for ${doc?._id}:`, error.message);
    }
});

module.exports = mongoose.model("Product", productSchema);
