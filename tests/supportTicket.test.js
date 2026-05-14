const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const SupportTicket = require('../src/models/SupportTicket');

function createResponseCapture() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function restoreModuleCache(modulePath, originalEntry) {
    if (originalEntry) {
        require.cache[modulePath] = originalEntry;
        return;
    }

    delete require.cache[modulePath];
}

async function withMockedSupportController({ supportTicketMock, userMock, activityLoggerMock }, run) {
    const controllerPath = require.resolve('../src/controllers/supportController');
    const supportTicketPath = require.resolve('../src/models/SupportTicket');
    const userPath = require.resolve('../src/models/User');
    const activityLoggerPath = require.resolve('../src/utils/activityLogger');

    const originalController = require.cache[controllerPath];
    const originalSupportTicket = require.cache[supportTicketPath];
    const originalUser = require.cache[userPath];
    const originalActivityLogger = require.cache[activityLoggerPath];

    delete require.cache[controllerPath];
    require.cache[supportTicketPath] = {
        id: supportTicketPath,
        filename: supportTicketPath,
        loaded: true,
        exports: supportTicketMock,
    };
    require.cache[userPath] = {
        id: userPath,
        filename: userPath,
        loaded: true,
        exports: userMock || {},
    };
    require.cache[activityLoggerPath] = {
        id: activityLoggerPath,
        filename: activityLoggerPath,
        loaded: true,
        exports: activityLoggerMock || { logAdminActivity: async () => { } },
    };

    try {
        const controller = require(controllerPath);
        return await run(controller);
    } finally {
        delete require.cache[controllerPath];
        restoreModuleCache(supportTicketPath, originalSupportTicket);
        restoreModuleCache(userPath, originalUser);
        restoreModuleCache(activityLoggerPath, originalActivityLogger);
        restoreModuleCache(controllerPath, originalController);
    }
}

async function runSupportTicketSavePreHooks(ticket) {
    await SupportTicket.schema.s.hooks.execPre('save', ticket, []);
}

test('support ticket pre-save hook generates a ticket number without callback middleware', async () => {
    const ticket = SupportTicket.hydrate({
        _id: new mongoose.Types.ObjectId(),
        customerName: 'Farhan Ahmed',
        customerEmail: 'user@handcraftjewelry.local',
        customerPhone: '+8801700000303',
        subject: 'Support smoke test',
        category: 'general',
        priority: 'normal',
        status: 'open',
        source: 'profile',
        messages: [
            {
                senderType: 'customer',
                senderName: 'Farhan Ahmed',
                message: 'Initial message',
            },
        ],
    });

    ticket.ticketNumber = undefined;

    await runSupportTicketSavePreHooks(ticket);

    assert.match(ticket.ticketNumber, /^SUP-/);
});

test('createTicket stores the initial customer message and returns an open ticket', async () => {
    let savedTicket = null;

    class MockSupportTicket {
        constructor(data) {
            Object.assign(this, data);
            this.messages = [];
        }

        async save() {
            this._id = 'ticket-1';
            savedTicket = JSON.parse(JSON.stringify(this));
            return this;
        }
    }

    await withMockedSupportController(
        { supportTicketMock: MockSupportTicket },
        async (controller) => {
            const req = {
                body: {
                    subject: 'My clasp broke',
                    message: 'Need repair help',
                    category: 'product',
                    priority: 'high',
                    source: 'profile',
                },
                user: {
                    _id: 'user-1',
                    name: 'Farhan Ahmed',
                    email: 'user@handcraftjewelry.local',
                    phone: '+8801700000303',
                },
            };
            const res = createResponseCapture();

            await controller.createTicket(req, res);

            assert.equal(res.statusCode, 201);
            assert.equal(res.body.ticket.status, 'open');
            assert.equal(res.body.ticket.customerEmail, 'user@handcraftjewelry.local');
            assert.equal(res.body.ticket.messages.length, 1);
            assert.equal(res.body.ticket.messages[0].senderType, 'customer');
            assert.equal(res.body.ticket.messages[0].message, 'Need repair help');
            assert.equal(savedTicket.messages.length, 1);
        }
    );
});

test('adminGetTickets returns support queue data for the admin screen', async () => {
    const returnedTickets = [
        {
            _id: 'ticket-1',
            ticketNumber: 'SUP-TEST-1',
            subject: 'Payment help',
            customerName: 'Farhan Ahmed',
            customerEmail: 'user@handcraftjewelry.local',
            status: 'open',
            priority: 'normal',
            category: 'payment',
        },
    ];
    let capturedQuery = null;

    const query = {
        sort(sortArg) {
            assert.deepEqual(sortArg, { lastMessageAt: -1, createdAt: -1 });
            return query;
        },
        skip(value) {
            assert.equal(value, 0);
            return query;
        },
        limit(value) {
            assert.equal(value, 20);
            return query;
        },
        populate() {
            return query;
        },
        then(resolve, reject) {
            return Promise.resolve(returnedTickets).then(resolve, reject);
        },
        catch(reject) {
            return Promise.resolve(returnedTickets).catch(reject);
        },
    };

    const supportTicketMock = {
        async countDocuments(queryArg) {
            capturedQuery = queryArg;
            return 1;
        },
        find(queryArg) {
            capturedQuery = queryArg;
            return query;
        },
    };

    await withMockedSupportController(
        { supportTicketMock },
        async (controller) => {
            const req = {
                query: {
                    page: 1,
                    limit: 20,
                    status: 'open',
                    search: 'Payment',
                },
            };
            const res = createResponseCapture();

            await controller.adminGetTickets(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.tickets.length, 1);
            assert.equal(res.body.tickets[0].ticketNumber, 'SUP-TEST-1');
            assert.equal(capturedQuery.status, 'open');
            assert.equal(capturedQuery.$or.length, 4);
            assert.equal(capturedQuery.$or[0].ticketNumber.$regex, 'Payment');
            assert.equal(capturedQuery.$or[3].subject.$regex, 'Payment');
        }
    );
});