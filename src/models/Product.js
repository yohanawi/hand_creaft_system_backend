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
            enum: ["active", "inactive"],
            default: "active",
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

productSchema.pre("validate", function (next) {
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

    next();
});

productSchema.pre("save", function () {
    if (!this.slug) {
        this.slug = slugify(this.name, { lower: true });
    }
});

module.exports = mongoose.model("Product", productSchema);
