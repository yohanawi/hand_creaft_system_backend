const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const syncProductArchiveStateInDatabase = async () => {
    const Product = require('../models/Product');

    const [
        archivedStatusFlagged,
        archivedFlagSynced,
        missingFlagsBackfilled,
        archivedTimestampsFilled,
        staleArchivedTimestampsCleared,
        archivedFeaturedCleared,
    ] = await Promise.all([
        Product.updateMany(
            { status: 'archived', isArchived: { $ne: true } },
            { $set: { isArchived: true } },
        ),
        Product.updateMany(
            { isArchived: true, status: { $ne: 'archived' } },
            { $set: { status: 'archived' } },
        ),
        Product.updateMany(
            { isArchived: { $exists: false }, status: { $ne: 'archived' } },
            { $set: { isArchived: false } },
        ),
        Product.updateMany(
            {
                status: 'archived',
                $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
            },
            [
                {
                    $set: {
                        archivedAt: {
                            $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', '$$NOW'] }],
                        },
                    },
                },
            ],
        ),
        Product.updateMany(
            { status: { $ne: 'archived' }, archivedAt: { $ne: null } },
            { $set: { archivedAt: null } },
        ),
        Product.updateMany(
            { status: 'archived', isFeatured: true },
            { $set: { isFeatured: false } },
        ),
    ]);

    const summary = {
        archivedStatusFlagged: archivedStatusFlagged.modifiedCount,
        archivedFlagSynced: archivedFlagSynced.modifiedCount,
        missingFlagsBackfilled: missingFlagsBackfilled.modifiedCount,
        archivedTimestampsFilled: archivedTimestampsFilled.modifiedCount,
        staleArchivedTimestampsCleared: staleArchivedTimestampsCleared.modifiedCount,
        archivedFeaturedCleared: archivedFeaturedCleared.modifiedCount,
    };

    if (Object.values(summary).some((count) => count > 0)) {
        console.log('Normalized product archive state:', summary);
    }
};

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is not defined. Check backend/.env configuration.');
        }

        const conn = await mongoose.connect(process.env.MONGO_URI);

        try {
            await syncProductArchiveStateInDatabase();
        } catch (error) {
            console.error('Product archive-state normalization failed:', error.message);
        }

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('Database connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB; 
