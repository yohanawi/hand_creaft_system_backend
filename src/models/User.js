const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            default: 'Address',
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        addressLine1: {
            type: String,
            required: true,
            trim: true,
        },
        addressLine2: {
            type: String,
            default: '',
            trim: true,
        },
        city: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            default: '',
            trim: true,
        },
        zipCode: {
            type: String,
            required: true,
            trim: true,
        },
        country: {
            type: String,
            default: 'US',
            trim: true,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    { _id: true, timestamps: true }
);

const cartVariantSchema = new mongoose.Schema(
    {
        variantId: {
            type: String,
            default: '',
            trim: true,
        },
        label: {
            type: String,
            default: '',
            trim: true,
        },
        size: {
            type: String,
            default: '',
            trim: true,
        },
        color: {
            type: String,
            default: '',
            trim: true,
        },
        style: {
            type: String,
            default: '',
            trim: true,
        },
        sku: {
            type: String,
            default: '',
            trim: true,
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        phone: {
            type: String,
            default: '',
            trim: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },
        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'user',
        },
        cart: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                quantity: {
                    type: Number,
                    default: 1,
                    min: 1,
                },
                name: {
                    type: String,
                    default: '',
                    trim: true,
                },
                thumbnailImage: {
                    type: String,
                    default: '',
                },
                price: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
                salePrice: {
                    type: Number,
                    default: null,
                    min: 0,
                },
                sku: {
                    type: String,
                    default: '',
                    trim: true,
                },
                selectedVariant: {
                    type: cartVariantSchema,
                    default: () => ({}),
                },
            },
        ],
        wishlist: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            },
        ],
        addresses: {
            type: [addressSchema],
            default: [],
        },
        passwordResetToken: {
            type: String,
            default: null,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            default: null,
            select: false,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

userSchema.pre('save', function (next) {
    if (!Array.isArray(this.addresses) || this.addresses.length === 0) {
        return next();
    }

    const defaultAddresses = this.addresses.filter((address) => address.isDefault);
    if (defaultAddresses.length === 0) {
        this.addresses[0].isDefault = true;
    }

    if (defaultAddresses.length > 1) {
        let firstDefaultSeen = false;
        this.addresses.forEach((address) => {
            if (address.isDefault && !firstDefaultSeen) {
                firstDefaultSeen = true;
                return;
            }
            address.isDefault = false;
        });
    }

    next();
});

module.exports = mongoose.model('User', userSchema);
