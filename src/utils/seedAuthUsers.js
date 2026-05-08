const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const slugify = require('slugify');

const connectDB = require('../config/db');
const User = require('../models/User');

const authSeedUsers = [
    {
        key: 'admin',
        name: 'Ayesha Rahman',
        email: 'admin@handcraftjewelry.local',
        phone: '+8801700000101',
        password: 'Admin@HandCraft2026!',
        role: 'admin',
        sellerStatus: 'inactive',
        emailVerified: true,
        addresses: [
            {
                label: 'Office',
                fullName: 'Ayesha Rahman',
                phone: '+8801700000101',
                addressLine1: 'House 12, Artisan Avenue',
                addressLine2: 'Gulshan 2',
                city: 'Dhaka',
                state: 'Dhaka',
                zipCode: '1212',
                country: 'BD',
                isDefault: true,
            },
        ],
    },
    {
        key: 'seller',
        name: 'Nabila Sultana',
        email: 'seller@handcraftjewelry.local',
        phone: '+8801700000202',
        password: 'Seller@HandCraft2026!',
        role: 'seller',
        sellerStatus: 'approved',
        emailVerified: true,
        sellerProfile: {
            shopName: 'Nabila Artisan Gems',
            shopSlug: 'nabila-artisan-gems',
            bio: 'Handmade jewelry studio focused on gemstone, pearl, and bridal artisan pieces.',
            logo: '',
            banner: '',
            contactEmail: 'seller@handcraftjewelry.local',
            contactPhone: '+8801700000202',
            addressLine1: 'Studio 7, Craft Market Lane',
            addressLine2: 'Banani',
            city: 'Dhaka',
            state: 'Dhaka',
            postalCode: '1213',
            country: 'BD',
            instagramHandle: '@nabilaartisan',
            facebookUrl: 'https://facebook.com/nabilaartisan',
            materials: ['Sterling Silver', 'Freshwater Pearl', 'Moonstone', 'Brass'],
            processingTimeLabel: '2-4 business days',
            shippingPolicy: 'Orders are packed in gift-ready boxes and shipped with tracked delivery.',
            returnPolicy: 'Returns accepted within 7 days for unworn items except personalized products.',
            bankName: 'Dutch-Bangla Bank',
            accountHolderName: 'Nabila Sultana',
            accountNumber: '12345678901234',
            routingNumber: '090123456',
            payoutEmail: 'seller-payout@handcraftjewelry.local',
        },
        addresses: [
            {
                label: 'Studio',
                fullName: 'Nabila Sultana',
                phone: '+8801700000202',
                addressLine1: 'Studio 7, Craft Market Lane',
                addressLine2: 'Banani',
                city: 'Dhaka',
                state: 'Dhaka',
                zipCode: '1213',
                country: 'BD',
                isDefault: true,
            },
        ],
    },
    {
        key: 'user',
        name: 'Farhan Ahmed',
        email: 'user@handcraftjewelry.local',
        phone: '+8801700000303',
        password: 'User@HandCraft2026!',
        role: 'user',
        sellerStatus: 'inactive',
        emailVerified: true,
        addresses: [
            {
                label: 'Home',
                fullName: 'Farhan Ahmed',
                phone: '+8801700000303',
                addressLine1: 'Road 8, Lake View Apartments',
                addressLine2: 'Dhanmondi',
                city: 'Dhaka',
                state: 'Dhaka',
                zipCode: '1209',
                country: 'BD',
                isDefault: true,
            },
        ],
    },
];

const validateSeedUsers = () => {
    const roles = authSeedUsers.map((user) => user.role);
    const uniqueEmails = new Set(authSeedUsers.map((user) => user.email.toLowerCase()));

    if (!roles.includes('admin') || !roles.includes('seller') || !roles.includes('user')) {
        throw new Error('Seed users must include admin, seller, and user roles');
    }

    if (uniqueEmails.size !== authSeedUsers.length) {
        throw new Error('Seed user emails must be unique');
    }
};

validateSeedUsers();

const normalizeSellerProfile = (user) => {
    if (user.role !== 'seller') {
        return {};
    }

    const sellerProfile = user.sellerProfile || {};

    return {
        ...sellerProfile,
        shopName: sellerProfile.shopName || user.name,
        shopSlug: sellerProfile.shopSlug || slugify(sellerProfile.shopName || user.name, { lower: true, strict: true }),
        contactEmail: sellerProfile.contactEmail || user.email,
        contactPhone: sellerProfile.contactPhone || user.phone || '',
    };
};

const upsertAuthUsers = async () => {
    for (const seedUser of authSeedUsers) {
        const hashedPassword = await bcrypt.hash(seedUser.password, 10);

        await User.findOneAndUpdate(
            { email: seedUser.email.toLowerCase() },
            {
                $set: {
                    name: seedUser.name,
                    email: seedUser.email.toLowerCase(),
                    phone: seedUser.phone,
                    password: hashedPassword,
                    role: seedUser.role,
                    sellerStatus: seedUser.sellerStatus,
                    sellerProfile: normalizeSellerProfile(seedUser),
                    emailVerified: seedUser.emailVerified,
                    addresses: Array.isArray(seedUser.addresses) ? seedUser.addresses : [],
                },
            },
            {
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );
    }
};

const seedAuthUsers = async () => {
    await connectDB();

    try {
        await upsertAuthUsers();

        console.log('Auth user seed complete.');
        console.log(`Users: ${authSeedUsers.length}`);
        console.log(`Admin email: ${authSeedUsers.find((user) => user.role === 'admin').email}`);
        console.log(`Seller email: ${authSeedUsers.find((user) => user.role === 'seller').email}`);
        console.log(`User email: ${authSeedUsers.find((user) => user.role === 'user').email}`);
    } finally {
        await mongoose.disconnect();
    }
};

if (require.main === module) {
    seedAuthUsers().catch((error) => {
        console.error('Failed to seed auth users:', error.message);
        process.exit(1);
    });
}

module.exports = {
    authSeedUsers,
    seedAuthUsers,
};