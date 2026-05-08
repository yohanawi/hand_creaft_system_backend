const ActivityLog = require('../models/ActivityLog');
const { sanitizeForLog } = require('../utils/activityLogger');

const MAX_EXPORT_ROWS = 10000;

const parseDateInput = (value, endOfDay = false) => {
    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }

    const normalized = raw.length === 10
        ? `${raw}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
        : raw;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const escapeCsv = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    return `"${String(text).replace(/"/g, '""')}"`;
};

const buildQuery = (queryParams = {}) => {
    const query = {};
    const action = String(queryParams.action || '').trim();
    const resourceType = String(queryParams.resourceType || '').trim();
    const userId = String(queryParams.userId || '').trim();
    const search = String(queryParams.search || '').trim();
    const startDate = parseDateInput(queryParams.startDate);
    const endDate = parseDateInput(queryParams.endDate, true);

    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (userId) query.user = userId;
    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
    }
    if (search) {
        query.$or = [
            { userName: { $regex: search, $options: 'i' } },
            { resourceName: { $regex: search, $options: 'i' } },
            { resourceType: { $regex: search, $options: 'i' } },
        ];
    }

    return query;
};

const toCsv = (logs) => {
    const header = [
        'timestamp',
        'adminName',
        'action',
        'resourceType',
        'resourceName',
        'resourceId',
        'ipAddress',
        'userAgent',
        'before',
        'after',
    ];
    const rows = logs.map((log) => [
        log.timestamp,
        log.userName,
        log.action,
        log.resourceType,
        log.resourceName,
        log.resourceId,
        log.ipAddress,
        log.userAgent,
        sanitizeForLog(log.changes?.before),
        sanitizeForLog(log.changes?.after),
    ]);

    return [header, ...rows]
        .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
        .join('\n');
};

exports.getActivityLogs = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
        const query = buildQuery(req.query);
        const format = String(req.query.format || '').trim().toLowerCase();

        if (format === 'csv') {
            const logs = await ActivityLog.find(query)
                .sort({ timestamp: -1 })
                .limit(MAX_EXPORT_ROWS)
                .lean();
            const csv = `\uFEFF${toCsv(logs)}`;
            const timestamp = new Date().toISOString().slice(0, 10);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${timestamp}.csv"`);
            return res.send(csv);
        }

        const total = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        return res.json({
            logs,
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};