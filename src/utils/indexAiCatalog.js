const mongoose = require('mongoose');

const connectDB = require('../config/db');
const Product = require('../models/Product');
const {
    getProductImageSource,
    hasFreshAiFeatures,
    indexProductDocument,
    markProductAiIndexStale,
} = require('./aiSearch');

async function indexAiCatalog() {
    await connectDB();

    const products = await Product.find({
        status: 'active',
        isArchived: { $ne: true },
    }).select('+features thumbnailImage images name sku featuresIndexed featuresImageSignature');

    const summary = {
        total: products.length,
        indexed: 0,
        skippedFresh: 0,
        skippedNoImage: 0,
        failed: 0,
    };

    for (const product of products) {
        const imageSource = getProductImageSource(product);

        if (!imageSource) {
            if (markProductAiIndexStale(product)) {
                await product.save();
            }
            summary.skippedNoImage += 1;
            continue;
        }

        if (hasFreshAiFeatures(product)) {
            summary.skippedFresh += 1;
            continue;
        }

        try {
            const features = await indexProductDocument(product);
            summary.indexed += 1;
            console.log(`Indexed ${product.sku || product._id}: ${features.length} dimensions`);
        } catch (error) {
            summary.failed += 1;
            console.error(`Failed ${product.sku || product._id}: ${error.message}`);
        }
    }

    console.log('AI catalog indexing complete:', summary);
}

indexAiCatalog()
    .catch((error) => {
        console.error('AI catalog indexing crashed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
