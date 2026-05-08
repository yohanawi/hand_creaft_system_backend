const slugify = require('slugify');
const nodemailer = require('nodemailer');
const Order = require('../models/Order');
const Product = require('../models/Product');
const SellerPayout = require('../models/SellerPayout');
const User = require('../models/User');
const { logAdminActivity } = require('../utils/activityLogger');

const SELLER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];
const PAYOUT_UPDATE_STATUSES = ['paid', 'rejected'];

const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));
const toId = (value) => String(value || '');
const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || '').trim());

const createMailTransporter = () => nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const canSendMail = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const getSellerShopName = (seller) => (
    String(seller?.sellerProfile?.shopName || seller?.name || 'HandCraft Seller').trim()
);

const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const getSellerFinancialSummary = async (sellerId) => {
    const orders = await Order.find({ 'items.sellerFulfillment.seller': sellerId })
        .select('items')
        .lean();

    let grossSales = 0;
    let availableBalance = 0;
    let requestedBalance = 0;
    let paidOutBalance = 0;
    const completedOrderIds = new Set();

    orders.forEach((order) => {
        let hasDeliveredItems = false;

        (order.items || []).forEach((item) => {
            if (toId(item?.sellerFulfillment?.seller) !== toId(sellerId)) {
                return;
            }

            grossSales += Number(item?.sellerFulfillment?.grossAmount || 0);

            const payoutStatus = String(item?.sellerFulfillment?.payoutStatus || 'unpaid');
            const netAmount = Number(item?.sellerFulfillment?.sellerNetAmount || 0);

            if (payoutStatus === 'available') availableBalance += netAmount;
            if (payoutStatus === 'requested') requestedBalance += netAmount;
            if (payoutStatus === 'paid') paidOutBalance += netAmount;
            if (item?.sellerFulfillment?.status === 'delivered') {
                hasDeliveredItems = true;
            }
        });

        if (hasDeliveredItems) {
            completedOrderIds.add(String(order._id));
        }
    });

    return {
        grossSales: roundCurrency(grossSales),
        availableBalance: roundCurrency(availableBalance),
        requestedBalance: roundCurrency(requestedBalance),
        paidOutBalance: roundCurrency(paidOutBalance),
        completedOrders: completedOrderIds.size,
    };
};

const getSellerPerformanceSummary = async (sellerId) => {
    const [
        totalProducts,
        activeProducts,
        averageRatings,
        orderTiming,
        financials,
    ] = await Promise.all([
        Product.countDocuments({ seller: sellerId }),
        Product.countDocuments({ seller: sellerId, status: 'active' }),
        Product.aggregate([
            { $match: { seller: sellerId } },
            {
                $group: {
                    _id: null,
                    averageRating: { $avg: '$averageRating' },
                    reviewCount: { $sum: '$reviewCount' },
                },
            },
        ]),
        Order.aggregate([
            { $match: { 'items.sellerFulfillment.seller': sellerId } },
            { $unwind: '$items' },
            { $match: { 'items.sellerFulfillment.seller': sellerId, 'items.sellerFulfillment.status': 'delivered' } },
            {
                $project: {
                    orderNumber: 1,
                    elapsedHours: {
                        $divide: [
                            {
                                $subtract: [
                                    { $ifNull: ['$deliveredAt', '$updatedAt'] },
                                    '$createdAt',
                                ],
                            },
                            1000 * 60 * 60,
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: '$orderNumber',
                    elapsedHours: { $avg: '$elapsedHours' },
                },
            },
            {
                $group: {
                    _id: null,
                    averageFulfillmentHours: { $avg: '$elapsedHours' },
                    orderCount: { $sum: 1 },
                },
            },
        ]),
        getSellerFinancialSummary(sellerId),
    ]);

    const completedOrders = Number(financials.completedOrders || orderTiming[0]?.orderCount || 0);

    return {
        totalProducts,
        activeProducts,
        grossSales: financials.grossSales,
        averageOrderValue: completedOrders ? roundCurrency(financials.grossSales / completedOrders) : 0,
        averageRating: roundCurrency(averageRatings[0]?.averageRating || 0),
        totalReviewCount: Number(averageRatings[0]?.reviewCount || 0),
        availableBalance: financials.availableBalance,
        requestedBalance: financials.requestedBalance,
        paidOutBalance: financials.paidOutBalance,
        completedOrders,
        averageFulfillmentHours: roundCurrency(orderTiming[0]?.averageFulfillmentHours || 0),
    };
};

const sendSellerStatusEmail = async (seller, nextStatus) => {
    if (!canSendMail()) {
        return { delivered: false, skipped: true };
    }

    const shopName = getSellerShopName(seller);
    const rejectionReason = String(seller?.sellerProfile?.rejectionReason || '').trim();
    const adminNotes = String(seller?.sellerProfile?.adminNotes || '').trim();
    const subject = `HandCraft seller application update: ${nextStatus}`;
    const details = [
        `Hello ${seller.name},`,
        '',
        `Your seller profile for ${shopName} has been updated to: ${nextStatus}.`,
    ];

    if (rejectionReason) {
        details.push('', `Reason: ${rejectionReason}`);
    }

    if (adminNotes) {
        details.push('', `Admin note: ${adminNotes}`);
    }

    details.push('', 'You can sign in to review the latest seller profile status in your account.');

    const transporter = createMailTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: seller.email,
        subject,
        text: details.join('\n'),
    });

    return { delivered: true, skipped: false };
};

const buildSellerListItem = async (seller) => {
    const metrics = await getSellerPerformanceSummary(seller._id);

    return {
        _id: seller._id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone || '',
        sellerStatus: seller.sellerStatus,
        shopName: getSellerShopName(seller),
        shopSlug: seller.sellerProfile?.shopSlug || '',
        contactEmail: seller.sellerProfile?.contactEmail || '',
        createdAt: seller.createdAt,
        reviewedAt: seller.sellerProfile?.reviewedAt || null,
        metrics,
    };
};

exports.getSellers = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
        const search = String(req.query.search || '').trim();
        const status = String(req.query.status || '').trim();

        const query = { role: 'seller' };

        if (status && SELLER_STATUSES.includes(status)) {
            query.sellerStatus = status;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { 'sellerProfile.shopName': { $regex: search, $options: 'i' } },
                { 'sellerProfile.contactEmail': { $regex: search, $options: 'i' } },
            ];
        }

        const [total, pendingCount, sellers] = await Promise.all([
            User.countDocuments(query),
            User.countDocuments({ role: 'seller', sellerStatus: 'pending' }),
            User.find(query)
                .sort({ sellerStatus: 1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('-password'),
        ]);

        const sellerRows = await Promise.all(sellers.map((seller) => buildSellerListItem(seller)));

        return res.json({
            sellers: sellerRows,
            total,
            page,
            pages: Math.ceil(total / limit),
            pendingCount,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.getSellerById = async (req, res) => {
    try {
        const seller = await User.findById(req.params.id).select('-password');
        if (!seller || seller.role !== 'seller') {
            return res.status(404).json({ message: 'Seller not found' });
        }

        const [metrics, recentProducts, recentPayouts, recentOrders] = await Promise.all([
            getSellerPerformanceSummary(seller._id),
            Product.find({ seller: seller._id })
                .sort({ updatedAt: -1 })
                .limit(6)
                .select('name sku status quantity price salePrice averageRating reviewCount sellerVisibilityBlocked updatedAt'),
            SellerPayout.find({ seller: seller._id })
                .sort({ createdAt: -1 })
                .limit(6)
                .select('amount currency status note bankReference requestedAt processedAt createdAt'),
            Order.find({ 'items.sellerFulfillment.seller': seller._id })
                .sort({ createdAt: -1 })
                .limit(6)
                .populate('user', 'name email')
                .select('orderNumber createdAt paymentStatus status total items shippingAddress'),
        ]);

        const orders = recentOrders.map((order) => {
            const sellerItems = (order.items || []).filter((item) => (
                toId(item?.sellerFulfillment?.seller) === toId(seller._id)
            ));

            return {
                _id: order._id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                paymentStatus: order.paymentStatus,
                status: order.status,
                total: roundCurrency(sellerItems.reduce((sum, item) => sum + Number(item?.sellerFulfillment?.grossAmount || 0), 0)),
                customer: order.user,
                itemCount: sellerItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
                sellerStatus: sellerItems[0]?.sellerFulfillment?.status || order.status,
                payoutStatus: sellerItems.every((item) => item?.sellerFulfillment?.payoutStatus === 'paid')
                    ? 'paid'
                    : sellerItems.some((item) => item?.sellerFulfillment?.payoutStatus === 'requested')
                        ? 'requested'
                        : sellerItems.some((item) => item?.sellerFulfillment?.payoutStatus === 'available')
                            ? 'available'
                            : 'unpaid',
            };
        });

        return res.json({
            seller: {
                _id: seller._id,
                name: seller.name,
                email: seller.email,
                phone: seller.phone || '',
                sellerStatus: seller.sellerStatus,
                sellerProfile: seller.sellerProfile || {},
                createdAt: seller.createdAt,
                metrics,
            },
            recentProducts,
            recentOrders: orders,
            recentPayouts,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.updateSeller = async (req, res) => {
    try {
        const seller = await User.findById(req.params.id);
        if (!seller || seller.role !== 'seller') {
            return res.status(404).json({ message: 'Seller not found' });
        }
        const before = seller.toObject();

        const previousStatus = seller.sellerStatus;
        const previousShopName = getSellerShopName(seller);
        const {
            name,
            email,
            phone,
            sellerStatus,
            adminNotes,
            rejectionReason,
            shopName,
            bio,
            logo,
            banner,
            contactEmail,
            contactPhone,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            instagramHandle,
            facebookUrl,
            materials,
            processingTimeLabel,
            shippingPolicy,
            returnPolicy,
            bankName,
            accountHolderName,
            accountNumber,
            routingNumber,
            payoutEmail,
        } = req.body;

        if (typeof name === 'string' && name.trim()) seller.name = name.trim();
        if (typeof phone === 'string') seller.phone = phone.trim();

        if (typeof email === 'string' && email.trim()) {
            const normalizedEmail = email.trim().toLowerCase();
            if (!isValidEmail(normalizedEmail)) {
                return res.status(400).json({ message: 'Please provide a valid email address' });
            }

            if (normalizedEmail !== seller.email) {
                const existingUser = await User.findOne({ email: normalizedEmail }).select('_id');
                if (existingUser && String(existingUser._id) !== String(seller._id)) {
                    return res.status(400).json({ message: 'Email already exists' });
                }
            }

            seller.email = normalizedEmail;
        }

        const nextShopName = String(shopName || seller.sellerProfile.shopName || seller.name || '').trim();
        if (!nextShopName) {
            return res.status(400).json({ message: 'Shop name is required' });
        }

        seller.sellerProfile.shopName = nextShopName;
        seller.sellerProfile.shopSlug = slugify(nextShopName, { lower: true, strict: true });
        if (typeof bio === 'string') seller.sellerProfile.bio = bio.trim();
        if (typeof logo === 'string') seller.sellerProfile.logo = logo.trim();
        if (typeof banner === 'string') seller.sellerProfile.banner = banner.trim();
        if (typeof contactEmail === 'string') {
            const normalizedContactEmail = contactEmail.trim().toLowerCase();
            if (normalizedContactEmail && !isValidEmail(normalizedContactEmail)) {
                return res.status(400).json({ message: 'Please provide a valid contact email address' });
            }
            seller.sellerProfile.contactEmail = normalizedContactEmail;
        }
        if (typeof contactPhone === 'string') seller.sellerProfile.contactPhone = contactPhone.trim();
        if (typeof addressLine1 === 'string') seller.sellerProfile.addressLine1 = addressLine1.trim();
        if (typeof addressLine2 === 'string') seller.sellerProfile.addressLine2 = addressLine2.trim();
        if (typeof city === 'string') seller.sellerProfile.city = city.trim();
        if (typeof state === 'string') seller.sellerProfile.state = state.trim();
        if (typeof postalCode === 'string') seller.sellerProfile.postalCode = postalCode.trim();
        if (typeof country === 'string' && country.trim()) seller.sellerProfile.country = country.trim();
        if (typeof instagramHandle === 'string') seller.sellerProfile.instagramHandle = instagramHandle.trim();
        if (typeof facebookUrl === 'string') seller.sellerProfile.facebookUrl = facebookUrl.trim();
        if (typeof materials !== 'undefined') seller.sellerProfile.materials = normalizeStringArray(materials);
        if (typeof processingTimeLabel === 'string') seller.sellerProfile.processingTimeLabel = processingTimeLabel.trim();
        if (typeof shippingPolicy === 'string') seller.sellerProfile.shippingPolicy = shippingPolicy.trim();
        if (typeof returnPolicy === 'string') seller.sellerProfile.returnPolicy = returnPolicy.trim();
        if (typeof bankName === 'string') seller.sellerProfile.bankName = bankName.trim();
        if (typeof accountHolderName === 'string') seller.sellerProfile.accountHolderName = accountHolderName.trim();
        if (typeof accountNumber === 'string' && accountNumber.trim()) seller.sellerProfile.accountNumber = accountNumber.trim();
        if (typeof routingNumber === 'string' && routingNumber.trim()) seller.sellerProfile.routingNumber = routingNumber.trim();
        if (typeof payoutEmail === 'string') {
            const normalizedPayoutEmail = payoutEmail.trim().toLowerCase();
            if (normalizedPayoutEmail && !isValidEmail(normalizedPayoutEmail)) {
                return res.status(400).json({ message: 'Please provide a valid payout email address' });
            }
            seller.sellerProfile.payoutEmail = normalizedPayoutEmail;
        }
        if (typeof adminNotes === 'string') seller.sellerProfile.adminNotes = adminNotes.trim();
        if (typeof rejectionReason === 'string') seller.sellerProfile.rejectionReason = rejectionReason.trim();

        let shouldRestoreProducts = false;
        let shouldHideProducts = false;

        if (sellerStatus) {
            if (!SELLER_STATUSES.includes(sellerStatus)) {
                return res.status(400).json({ message: 'Invalid seller status' });
            }

            if (sellerStatus === 'rejected' && !String(rejectionReason || seller.sellerProfile.rejectionReason || '').trim()) {
                return res.status(400).json({ message: 'Rejection reason is required when rejecting a seller' });
            }

            seller.sellerStatus = sellerStatus;
            seller.sellerProfile.reviewedAt = new Date();
            if (sellerStatus === 'approved') {
                seller.sellerProfile.rejectionReason = '';
            }

            if (previousStatus !== 'approved' && sellerStatus === 'approved') {
                shouldRestoreProducts = true;
            }

            if (['suspended', 'rejected'].includes(sellerStatus)) {
                shouldHideProducts = true;
            }
        }

        await seller.save();

        if (previousShopName !== getSellerShopName(seller)) {
            await Product.updateMany(
                { seller: seller._id },
                { $set: { sellerShopName: getSellerShopName(seller) } },
            );
        }

        if (shouldHideProducts) {
            await Product.updateMany(
                { seller: seller._id },
                { $set: { status: 'inactive', sellerVisibilityBlocked: true } },
            );
        }

        if (shouldRestoreProducts) {
            await Product.updateMany(
                { seller: seller._id, sellerVisibilityBlocked: true },
                { $set: { status: 'active', sellerVisibilityBlocked: false } },
            );
        }

        let notification = { delivered: false, skipped: true };
        if (sellerStatus && previousStatus !== seller.sellerStatus) {
            notification = await sendSellerStatusEmail(seller, seller.sellerStatus);
        }

        const refreshedSeller = await User.findById(seller._id).select('-password');
        const metrics = await getSellerPerformanceSummary(seller._id);

        let action = 'update';
        if (seller.sellerStatus !== previousStatus) {
            if (seller.sellerStatus === 'approved') {
                action = previousStatus === 'suspended' ? 'reactivate' : 'approve';
            } else if (seller.sellerStatus === 'rejected') {
                action = 'reject';
            } else if (seller.sellerStatus === 'suspended') {
                action = 'suspend';
            }
        }

        await logAdminActivity({
            req,
            action,
            resourceType: 'seller_application',
            resourceId: refreshedSeller._id,
            resourceName: getSellerShopName(refreshedSeller),
            before,
            after: {
                _id: refreshedSeller._id,
                name: refreshedSeller.name,
                email: refreshedSeller.email,
                phone: refreshedSeller.phone || '',
                sellerStatus: refreshedSeller.sellerStatus,
                sellerProfile: refreshedSeller.sellerProfile || {},
                metrics,
            },
        });

        return res.json({
            message: 'Seller updated successfully',
            seller: {
                _id: refreshedSeller._id,
                name: refreshedSeller.name,
                email: refreshedSeller.email,
                phone: refreshedSeller.phone || '',
                sellerStatus: refreshedSeller.sellerStatus,
                sellerProfile: refreshedSeller.sellerProfile || {},
                metrics,
            },
            notification,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.getPayoutRequests = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
        const status = String(req.query.status || '').trim();
        const search = String(req.query.search || '').trim();

        const query = {};
        if (status && ['pending', 'approved', 'paid', 'rejected'].includes(status)) {
            query.status = status;
        }

        let sellerIds = null;
        if (search) {
            const matchedSellers = await User.find({
                role: 'seller',
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { 'sellerProfile.shopName': { $regex: search, $options: 'i' } },
                ],
            }).distinct('_id');
            sellerIds = matchedSellers;
            query.seller = { $in: matchedSellers };
        }

        const [total, payouts, statsAgg] = await Promise.all([
            User.countDocuments(search ? { _id: { $in: sellerIds || [] } } : { role: 'seller' }).then(() => SellerPayout.countDocuments(query)),
            SellerPayout.find(query)
                .sort({ status: 1, requestedAt: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('seller', 'name email sellerStatus sellerProfile.shopName sellerProfile.bankName sellerProfile.accountHolderName sellerProfile.payoutEmail'),
            SellerPayout.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        amount: { $sum: '$amount' },
                    },
                },
            ]),
        ]);

        const rows = await Promise.all((payouts || []).map(async (payout) => {
            const sellerSummary = await getSellerFinancialSummary(payout.seller?._id || payout.seller);
            return {
                _id: payout._id,
                amount: roundCurrency(payout.amount),
                currency: payout.currency,
                status: payout.status,
                note: payout.note,
                bankReference: payout.bankReference,
                requestedAt: payout.requestedAt,
                processedAt: payout.processedAt,
                createdAt: payout.createdAt,
                allocations: payout.allocations || [],
                seller: payout.seller,
                sellerAvailableBalance: sellerSummary.availableBalance,
            };
        }));

        const overview = statsAgg.reduce((acc, row) => {
            acc[row._id] = {
                count: row.count,
                amount: roundCurrency(row.amount),
            };
            return acc;
        }, {});

        return res.json({
            payouts: rows,
            total,
            page,
            pages: Math.ceil(total / limit),
            overview,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.updatePayoutRequest = async (req, res) => {
    try {
        const payout = await SellerPayout.findById(req.params.id).populate('seller', 'name email sellerProfile');
        if (!payout) {
            return res.status(404).json({ message: 'Payout request not found' });
        }
        const before = payout.toObject();

        const nextStatus = String(req.body.status || '').trim();
        if (!PAYOUT_UPDATE_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ message: 'Invalid payout status' });
        }

        if (['paid', 'rejected'].includes(payout.status)) {
            return res.status(400).json({ message: 'This payout request has already been processed' });
        }

        payout.status = nextStatus;
        payout.processedAt = new Date();
        if (typeof req.body.note === 'string') payout.note = req.body.note.trim();
        if (typeof req.body.bankReference === 'string') payout.bankReference = req.body.bankReference.trim();
        await payout.save();

        const updatesByOrder = new Map();
        (payout.allocations || []).forEach((allocation) => {
            const orderKey = String(allocation.orderId);
            if (!updatesByOrder.has(orderKey)) {
                updatesByOrder.set(orderKey, []);
            }
            updatesByOrder.get(orderKey).push(allocation.itemIndex);
        });

        await Promise.all(Array.from(updatesByOrder.entries()).map(async ([orderId, itemIndexes]) => {
            const order = await Order.findById(orderId);
            if (!order) {
                return;
            }

            itemIndexes.forEach((itemIndex) => {
                if (!order.items[itemIndex]?.sellerFulfillment) {
                    return;
                }

                order.items[itemIndex].sellerFulfillment.payoutStatus = nextStatus === 'paid' ? 'paid' : 'available';
            });

            await order.save();
        }));

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'seller_payout',
            resourceId: payout._id,
            resourceName: `${payout.seller?.sellerProfile?.shopName || payout.seller?.name || 'Seller'} payout`,
            before,
            after: payout.toObject(),
        });

        return res.json({
            message: `Payout request marked as ${nextStatus}`,
            payout,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};