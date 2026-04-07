const Coupon = require('../models/Coupon');

const normalizeCouponPayload = (body = {}) => {
    const type = body.type;
    const value = Number(body.value);
    const minOrderAmount = body.minOrderAmount !== undefined ? Number(body.minOrderAmount) : 0;
    const maxDiscount = body.maxDiscount !== undefined && body.maxDiscount !== null && body.maxDiscount !== ''
        ? Number(body.maxDiscount)
        : null;
    const usageLimit = body.usageLimit !== undefined && body.usageLimit !== null && body.usageLimit !== ''
        ? Number(body.usageLimit)
        : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    if (!['percentage', 'fixed'].includes(type)) {
        return { error: 'Coupon type must be percentage or fixed' };
    }

    if (!Number.isFinite(value) || value <= 0) {
        return { error: 'Coupon value must be greater than 0' };
    }

    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
        return { error: 'minOrderAmount must be 0 or greater' };
    }

    if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) {
        return { error: 'maxDiscount must be 0 or greater' };
    }

    if (usageLimit !== null && (!Number.isFinite(usageLimit) || usageLimit < 1)) {
        return { error: 'usageLimit must be at least 1' };
    }

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return { error: 'expiresAt must be a valid date' };
    }

    return {
        value: {
            code: String(body.code || '').trim().toUpperCase(),
            type,
            value,
            minOrderAmount,
            maxDiscount,
            usageLimit,
            expiresAt,
            active: body.active !== undefined ? !!body.active : true,
        },
    };
};

const calculateCouponDiscount = (coupon, subtotal) => {
    if (!coupon.active) {
        return { error: 'Coupon is inactive' };
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return { error: 'Coupon has expired' };
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        return { error: 'Coupon usage limit reached' };
    }

    if (subtotal < coupon.minOrderAmount) {
        return { error: `Minimum order amount is ${coupon.minOrderAmount}` };
    }

    let discount = coupon.type === 'percentage'
        ? subtotal * (coupon.value / 100)
        : coupon.value;

    if (coupon.maxDiscount !== null) {
        discount = Math.min(discount, coupon.maxDiscount);
    }

    discount = Math.min(discount, subtotal);
    return { discount: Number(discount.toFixed(2)) };
};

exports.validateCouponCode = async (req, res) => {
    try {
        const code = String(req.body.code || '').trim().toUpperCase();
        const subtotal = Number(req.body.subtotal || 0);
        if (!code) {
            return res.status(400).json({ message: 'Coupon code is required' });
        }

        const coupon = await Coupon.findOne({ code });
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        const result = calculateCouponDiscount(coupon, subtotal);
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        res.json({
            valid: true,
            coupon: {
                code: coupon.code,
                type: coupon.type,
                value: coupon.value,
                minOrderAmount: coupon.minOrderAmount,
                maxDiscount: coupon.maxDiscount,
                expiresAt: coupon.expiresAt,
            },
            discount: result.discount,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const normalized = normalizeCouponPayload(req.body);
        if (normalized.error) {
            return res.status(400).json({ message: normalized.error });
        }

        if (!normalized.value.code) {
            return res.status(400).json({ message: 'Coupon code is required' });
        }

        const coupon = await Coupon.create(normalized.value);
        res.status(201).json(coupon);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        const normalized = normalizeCouponPayload({ ...coupon.toObject(), ...req.body, code: req.body.code ?? coupon.code });
        if (normalized.error) {
            return res.status(400).json({ message: normalized.error });
        }

        Object.assign(coupon, normalized.value);
        await coupon.save();
        res.json(coupon);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        res.json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.calculateCouponDiscount = calculateCouponDiscount;