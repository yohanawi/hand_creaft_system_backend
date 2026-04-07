const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

const TICKET_CATEGORIES = ['order', 'payment', 'shipping', 'product', 'technical', 'account', 'general'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TICKET_STATUSES = ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'];

const buildPagingMeta = (page, limit, total) => {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
        total,
        page: Number(page),
        pages: totalPages,
        totalPages,
    };
};

const sanitizeCategory = (value) => (
    TICKET_CATEGORIES.includes(String(value || '').trim()) ? String(value).trim() : 'general'
);

const sanitizePriority = (value) => (
    TICKET_PRIORITIES.includes(String(value || '').trim()) ? String(value).trim() : 'normal'
);

const appendMessage = (ticket, { senderType, senderUser = null, senderName = '', message }) => {
    ticket.messages.push({
        senderType,
        senderUser,
        senderName,
        message: String(message).trim(),
        createdAt: new Date(),
    });
    ticket.lastMessageAt = new Date();
    if (senderType === 'customer') {
        ticket.lastCustomerReplyAt = new Date();
    }
    if (senderType === 'admin') {
        ticket.lastAdminReplyAt = new Date();
    }
};

exports.createTicket = async (req, res) => {
    try {
        const nameFromUser = req.user?.name || '';
        const emailFromUser = req.user?.email || '';
        const phoneFromUser = req.user?.phone || '';

        const customerName = String(req.body.customerName || nameFromUser).trim();
        const customerEmail = String(req.body.customerEmail || emailFromUser).trim().toLowerCase();
        const customerPhone = String(req.body.customerPhone || phoneFromUser).trim();
        const subject = String(req.body.subject || '').trim();
        const message = String(req.body.message || '').trim();
        const source = String(req.body.source || 'contact_form').trim();
        const category = sanitizeCategory(req.body.category);
        const priority = sanitizePriority(req.body.priority);

        if (!customerName || !customerEmail || !subject || !message) {
            return res.status(400).json({ message: 'customerName, customerEmail, subject, and message are required' });
        }

        const ticket = new SupportTicket({
            user: req.user?._id || null,
            customerName,
            customerEmail,
            customerPhone,
            subject,
            category,
            priority,
            source,
            status: 'open',
        });

        appendMessage(ticket, {
            senderType: 'customer',
            senderUser: req.user?._id || null,
            senderName: customerName,
            message,
        });

        await ticket.save();

        res.status(201).json({
            message: 'Support ticket created successfully',
            ticket,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMyTickets = async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const query = { user: req.user._id };
        if (status && TICKET_STATUSES.includes(String(status))) {
            query.status = status;
        }

        const total = await SupportTicket.countDocuments(query);
        const tickets = await SupportTicket.find(query)
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('order', 'orderNumber')
            .populate('adminAssignee', 'name');

        res.json({ tickets, ...buildPagingMeta(page, Number(limit), total) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMyTicketById = async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id })
            .populate('order', 'orderNumber')
            .populate('adminAssignee', 'name')
            .populate('messages.senderUser', 'name email');

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.json({ ticket });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.replyToMyTicket = async (req, res) => {
    try {
        const message = String(req.body.message || '').trim();
        if (!message) {
            return res.status(400).json({ message: 'message is required' });
        }

        const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ message: 'Cannot reply to a closed ticket' });
        }

        appendMessage(ticket, {
            senderType: 'customer',
            senderUser: req.user._id,
            senderName: req.user.name,
            message,
        });

        if (['resolved', 'pending_customer'].includes(ticket.status)) {
            ticket.status = 'open';
            ticket.resolvedAt = null;
        }

        await ticket.save();
        res.json({ message: 'Reply added successfully', ticket });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminGetTickets = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, priority, category, search } = req.query;
        const query = {};
        if (status && TICKET_STATUSES.includes(String(status))) query.status = status;
        if (priority && TICKET_PRIORITIES.includes(String(priority))) query.priority = priority;
        if (category && TICKET_CATEGORIES.includes(String(category))) query.category = category;
        if (search) {
            query.$or = [
                { ticketNumber: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await SupportTicket.countDocuments(query);
        const tickets = await SupportTicket.find(query)
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('user', 'name email')
            .populate('order', 'orderNumber')
            .populate('adminAssignee', 'name');

        res.json({ tickets, ...buildPagingMeta(page, Number(limit), total) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminGetTicketById = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('user', 'name email')
            .populate('order', 'orderNumber total status')
            .populate('adminAssignee', 'name email')
            .populate('messages.senderUser', 'name email');

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.json({ ticket });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminReplyToTicket = async (req, res) => {
    try {
        const message = String(req.body.message || '').trim();
        if (!message) {
            return res.status(400).json({ message: 'message is required' });
        }

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        appendMessage(ticket, {
            senderType: 'admin',
            senderUser: req.user._id,
            senderName: req.user.name,
            message,
        });

        ticket.status = req.body.status && TICKET_STATUSES.includes(String(req.body.status))
            ? String(req.body.status)
            : 'pending_customer';
        ticket.adminAssignee = ticket.adminAssignee || req.user._id;

        if (ticket.status === 'resolved') {
            ticket.resolvedAt = new Date();
        }
        if (ticket.status === 'closed') {
            ticket.closedAt = new Date();
        }

        await ticket.save();
        res.json({ message: 'Reply added successfully', ticket });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminUpdateTicket = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        const { status, priority, category, adminAssigneeId, tags } = req.body;

        if (status && !TICKET_STATUSES.includes(String(status))) {
            return res.status(400).json({ message: 'Invalid status value' });
        }
        if (priority && !TICKET_PRIORITIES.includes(String(priority))) {
            return res.status(400).json({ message: 'Invalid priority value' });
        }
        if (category && !TICKET_CATEGORIES.includes(String(category))) {
            return res.status(400).json({ message: 'Invalid category value' });
        }

        if (status) ticket.status = String(status);
        if (priority) ticket.priority = String(priority);
        if (category) ticket.category = String(category);
        if (typeof adminAssigneeId === 'string') {
            if (!adminAssigneeId.trim()) {
                ticket.adminAssignee = null;
            } else {
                const assignee = await User.findById(adminAssigneeId).select('_id role');
                if (!assignee || assignee.role !== 'admin') {
                    return res.status(400).json({ message: 'Assigned user must be an admin' });
                }
                ticket.adminAssignee = assignee._id;
            }
        }
        if (Array.isArray(tags)) {
            ticket.tags = tags.map((tag) => String(tag).trim()).filter(Boolean);
        }

        if (ticket.status === 'resolved' && !ticket.resolvedAt) ticket.resolvedAt = new Date();
        if (ticket.status === 'closed' && !ticket.closedAt) ticket.closedAt = new Date();
        if (ticket.status !== 'closed') ticket.closedAt = null;
        if (ticket.status !== 'resolved') ticket.resolvedAt = null;

        await ticket.save();
        res.json({ message: 'Ticket updated successfully', ticket });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.adminTicketStats = async (req, res) => {
    try {
        const [
            total,
            open,
            inProgress,
            pendingCustomer,
            resolved,
            closed,
            urgent,
            high,
            recentTickets,
        ] = await Promise.all([
            SupportTicket.countDocuments(),
            SupportTicket.countDocuments({ status: 'open' }),
            SupportTicket.countDocuments({ status: 'in_progress' }),
            SupportTicket.countDocuments({ status: 'pending_customer' }),
            SupportTicket.countDocuments({ status: 'resolved' }),
            SupportTicket.countDocuments({ status: 'closed' }),
            SupportTicket.countDocuments({ priority: 'urgent' }),
            SupportTicket.countDocuments({ priority: 'high' }),
            SupportTicket.find()
                .sort({ lastMessageAt: -1 })
                .limit(6)
                .select('ticketNumber subject status priority customerName lastMessageAt'),
        ]);

        res.json({
            stats: {
                total,
                open,
                inProgress,
                pendingCustomer,
                resolved,
                closed,
                urgent,
                high,
            },
            recentTickets,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};