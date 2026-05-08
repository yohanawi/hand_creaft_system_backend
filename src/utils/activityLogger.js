const ActivityLog = require('../models/ActivityLog');

const REDACTED_KEYS = new Set([
    'password',
    'resetPasswordToken',
    'resetPasswordExpires',
    'accountNumber',
    'routingNumber',
]);

const toPlainObject = (value) => {
    if (!value) {
        return value;
    }

    if (typeof value.toObject === 'function') {
        return value.toObject({ depopulate: true });
    }

    return value;
};

const sanitizeForLog = (value) => {
    if (value === null || typeof value === 'undefined') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForLog(item));
    }

    if (typeof value !== 'object') {
        return value;
    }

    const plainValue = toPlainObject(value);
    const result = {};

    Object.entries(plainValue).forEach(([key, nestedValue]) => {
        if (key === '__v') {
            return;
        }

        if (REDACTED_KEYS.has(key)) {
            result[key] = '[redacted]';
            return;
        }

        result[key] = sanitizeForLog(nestedValue);
    });

    return result;
};

const getIpAddress = (req) => String(
    req.headers['x-forwarded-for']
    || req.ip
    || req.connection?.remoteAddress
    || ''
).split(',')[0].trim();

const logAdminActivity = async ({
    req,
    action,
    resourceType,
    resourceId,
    resourceName,
    before,
    after,
}) => {
    if (!req?.user || req.user.role !== 'admin') {
        return;
    }

    try {
        await ActivityLog.create({
            user: req.user._id,
            userName: req.user.name || req.user.email || 'Admin User',
            action,
            resourceType,
            resourceId: resourceId || null,
            resourceName: String(resourceName || '').trim(),
            changes: {
                before: sanitizeForLog(before),
                after: sanitizeForLog(after),
            },
            ipAddress: getIpAddress(req),
            userAgent: String(req.headers['user-agent'] || '').trim(),
            timestamp: new Date(),
        });
    } catch (error) {
        console.error('Failed to write activity log:', error.message);
    }
};

module.exports = {
    logAdminActivity,
    sanitizeForLog,
};