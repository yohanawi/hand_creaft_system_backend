const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Order = require('../models/Order');
const SupportTicket = require('../models/SupportTicket');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const createMailTransporter = () =>
    nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '7d',
    });
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(value);

const sanitizeUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    emailVerified: !!user.emailVerified,
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
});

const normalizeAddressPayload = (payload = {}) => {
    const fullName = String(payload.fullName || '').trim();
    const phone = String(payload.phone || '').trim();
    const addressLine1 = String(payload.addressLine1 || payload.address || '').trim();
    const addressLine2 = String(payload.addressLine2 || '').trim();
    const city = String(payload.city || '').trim();
    const state = String(payload.state || '').trim();
    const zipCode = String(payload.zipCode || '').trim();
    const country = String(payload.country || 'US').trim();
    const label = String(payload.label || 'Address').trim();

    if (!fullName || !phone || !addressLine1 || !city || !zipCode) {
        return { error: 'fullName, phone, addressLine1, city, and zipCode are required' };
    }

    return {
        value: {
            label,
            fullName,
            phone,
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
            country,
            isDefault: !!payload.isDefault,
        },
    };
};

// Register User
exports.register = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');
        const phone = String(req.body.phone || '').trim();

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'name, email, and password are required' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
        });

        res.status(201).json({
            message: 'User registered successfully',
            token: generateToken(user._id),
            user: sanitizeUser(user),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Login User
exports.login = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        res.json({
            message: 'Login successful',
            token: generateToken(user._id),
            user: sanitizeUser(user),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(sanitizeUser(user));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getCustomerOverview = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const cartItems = Array.isArray(user.cart) ? user.cart : [];
        const addresses = Array.isArray(user.addresses) ? user.addresses : [];
        const wishlistCount = Array.isArray(user.wishlist) ? user.wishlist.length : 0;
        const defaultAddress = addresses.find((address) => address.isDefault) || addresses[0] || null;
        const cartTotal = cartItems.reduce((sum, item) => {
            const regularPrice = Number(item?.price || 0);
            const salePrice = item?.salePrice == null ? null : Number(item.salePrice);
            const unitPrice = salePrice != null && salePrice < regularPrice ? salePrice : regularPrice;
            return sum + (unitPrice * Number(item?.quantity || 0));
        }, 0);

        const [recentOrders, recentSupportTickets, orderCount, deliveredOrderCount, openTicketCount] = await Promise.all([
            Order.find({ user: req.user._id })
                .sort({ createdAt: -1 })
                .limit(3)
                .select('orderNumber status paymentStatus total createdAt items')
                .lean(),
            SupportTicket.find({ user: req.user._id })
                .sort({ lastMessageAt: -1, createdAt: -1 })
                .limit(3)
                .select('ticketNumber subject status priority lastMessageAt')
                .lean(),
            Order.countDocuments({ user: req.user._id }),
            Order.countDocuments({ user: req.user._id, status: 'delivered' }),
            SupportTicket.countDocuments({
                user: req.user._id,
                status: { $nin: ['resolved', 'closed'] },
            }),
        ]);

        res.json({
            user: sanitizeUser(user),
            addresses,
            defaultAddress,
            summary: {
                orderCount,
                deliveredOrderCount,
                openTicketCount,
                wishlistCount,
                cartLineCount: cartItems.length,
                cartItemCount: cartItems.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
                cartTotal: Number(cartTotal.toFixed(2)),
            },
            recentOrders,
            recentSupportTickets,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const { name, email, phone } = req.body;

        if (typeof name === 'string' && name.trim()) {
            user.name = name.trim();
        }

        if (typeof email === 'string' && email.trim() && email.trim().toLowerCase() !== user.email) {
            const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
            if (existingUser && String(existingUser._id) !== String(user._id)) {
                return res.status(400).json({ message: 'Email already exists' });
            }
            user.email = email.trim().toLowerCase();
        }

        if (typeof phone === 'string') {
            user.phone = phone.trim();
        }

        await user.save();
        res.json({ message: 'Profile updated successfully', user: sanitizeUser(user) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'currentPassword and newPassword are required' });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user._id).select('+password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
        if (!user) {
            return res.json({ message: 'If an account exists for that email, a reset link has been generated.' });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30);
        await user.save();

        const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
        const resetUrl = `${frontendBaseUrl}/reset-password?token=${rawToken}`;

        // Send email if SMTP is configured; otherwise return the link (dev mode)
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = createMailTransporter();
            await transporter.sendMail({
                from: `"HandCraft Store" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Reset Your Password — HandCraft',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                        <h2 style="color:#8B4513;">Password Reset Request</h2>
                        <p>You requested a password reset for your <strong>HandCraft</strong> account.</p>
                        <p>Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
                        <a href="${resetUrl}"
                           style="display:inline-block;margin:16px 0;padding:12px 28px;background:#8B4513;
                                  color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
                            Reset Password
                        </a>
                        <p style="color:#6B7280;font-size:13px;">
                            If you did not request this, you can safely ignore this email.
                            Your password will not change.
                        </p>
                    </div>`,
            });
            res.json({ message: 'Password reset email sent. Please check your inbox.' });
        } else {
            // Development fallback — return the raw link in the response
            res.json({
                message: 'Password reset link generated (dev mode — configure SMTP_USER and SMTP_PASS to send real emails).',
                resetUrl,
                resetToken: rawToken,
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ message: 'token and newPassword are required' });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: new Date() },
        }).select('+passwordResetToken +passwordResetExpires');

        if (!user) {
            return res.status(400).json({ message: 'Reset token is invalid or expired' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('addresses');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user.addresses || []);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addAddress = async (req, res) => {
    try {
        const normalized = normalizeAddressPayload(req.body);
        if (normalized.error) {
            return res.status(400).json({ message: normalized.error });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const nextAddress = normalized.value;
        if (nextAddress.isDefault) {
            user.addresses.forEach((address) => {
                address.isDefault = false;
            });
        }

        user.addresses.push(nextAddress);
        await user.save();

        res.status(201).json({ message: 'Address added successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateAddress = async (req, res) => {
    try {
        const normalized = normalizeAddressPayload(req.body);
        if (normalized.error) {
            return res.status(400).json({ message: normalized.error });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const address = user.addresses.id(req.params.id);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

        if (normalized.value.isDefault) {
            user.addresses.forEach((item) => {
                item.isDefault = false;
            });
        }

        Object.assign(address, normalized.value);
        await user.save();

        res.json({ message: 'Address updated successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const address = user.addresses.id(req.params.id);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const wasDefault = address.isDefault;
        address.deleteOne();
        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
        }

        await user.save();
        res.json({ message: 'Address deleted successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.setDefaultAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const address = user.addresses.id(req.params.id);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

        user.addresses.forEach((item) => {
            item.isDefault = String(item._id) === String(address._id);
        });

        await user.save();
        res.json({ message: 'Default address updated successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
