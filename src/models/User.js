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

const sellerProfileSchema = new mongoose.Schema(
    {
        shopName: {
            type: String,
            default: '',
            trim: true,
        },
        shopSlug: {
            type: String,
            default: '',
            trim: true,
        },
        bio: {
            type: String,
            default: '',
            trim: true,
        },
        logo: {
            type: String,
            default: '',
            trim: true,
        },
        banner: {
            type: String,
            default: '',
            trim: true,
        },
        contactEmail: {
            type: String,
            default: '',
            trim: true,
            lowercase: true,
        },
        contactPhone: {
            type: String,
            default: '',
            trim: true,
        },
        addressLine1: {
            type: String,
            default: '',
            trim: true,
        },
        addressLine2: {
            type: String,
            default: '',
            trim: true,
        },
        city: {
            type: String,
            default: '',
            trim: true,
        },
        state: {
            type: String,
            default: '',
            trim: true,
        },
        postalCode: {
            type: String,
            default: '',
            trim: true,
        },
        country: {
            type: String,
            default: 'US',
            trim: true,
        },
        instagramHandle: {
            type: String,
            default: '',
            trim: true,
        },
        facebookUrl: {
            type: String,
            default: '',
            trim: true,
        },
        materials: {
            type: [String],
            default: [],
        },
        processingTimeLabel: {
            type: String,
            default: '',
            trim: true,
        },
        shippingPolicy: {
            type: String,
            default: '',
            trim: true,
        },
        returnPolicy: {
            type: String,
            default: '',
            trim: true,
        },
        bankName: {
            type: String,
            default: '',
            trim: true,
        },
        accountHolderName: {
            type: String,
            default: '',
            trim: true,
        },
        accountNumber: {
            type: String,
            default: '',
            trim: true,
        },
        routingNumber: {
            type: String,
            default: '',
            trim: true,
        },
        payoutEmail: {
            type: String,
            default: '',
            trim: true,
            lowercase: true,
        },
        adminNotes: {
            type: String,
            default: '',
            trim: true,
        },
        rejectionReason: {
            type: String,
            default: '',
            trim: true,
        },
        reviewedAt: {
            type: Date,
            default: null,
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
            enum: ['user', 'seller', 'admin'],
            default: 'user',
        },
        sellerStatus: {
            type: String,
            enum: ['inactive', 'pending', 'approved', 'rejected', 'suspended'],
            default: 'inactive',
        },
        sellerProfile: {
            type: sellerProfileSchema,
            default: () => ({}),
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

userSchema.pre('save', function () {
    if (this.role === 'seller' && this.sellerStatus === 'inactive') {
        this.sellerStatus = 'approved';
    }

    if (this.role !== 'seller' && this.sellerStatus !== 'inactive') {
        this.sellerStatus = 'inactive';
    }

    if (!this.sellerProfile.shopName && this.role === 'seller') {
        this.sellerProfile.shopName = this.name;
    }

    if (!Array.isArray(this.addresses) || this.addresses.length === 0) {
        return;
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
});

module.exports = mongoose.model('User', userSchema);
