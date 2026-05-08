const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const User = require('../models/User');

const getArgValue = (flag) => {
    const index = process.argv.indexOf(flag);
    if (index === -1) return '';
    return String(process.argv[index + 1] || '').trim();
};

const printUsage = () => {
    console.log('Usage: npm run admin:bootstrap -- --email admin@example.com --password your-password [--name "Admin User"] [--phone "+1..."]');
    console.log('You can also provide ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, and ADMIN_PHONE as environment variables.');
};

const resolveConfig = () => ({
    email: String(getArgValue('--email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: String(getArgValue('--password') || process.env.ADMIN_PASSWORD || ''),
    name: String(getArgValue('--name') || process.env.ADMIN_NAME || 'Store Admin').trim(),
    phone: String(getArgValue('--phone') || process.env.ADMIN_PHONE || '').trim(),
});

const main = async () => {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printUsage();
        return;
    }

    const { email, password, name, phone } = resolveConfig();

    if (!email || !password) {
        console.error('ADMIN_EMAIL/--email and ADMIN_PASSWORD/--password are required.');
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (password.length < 6) {
        console.error('Admin password must be at least 6 characters long.');
        process.exitCode = 1;
        return;
    }

    await connectDB();

    const existingUser = await User.findOne({ email });
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!existingUser) {
        const adminUser = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'admin',
            emailVerified: true,
        });

        console.log(`Admin user created: ${adminUser.email}`);
        return;
    }

    existingUser.name = name || existingUser.name;
    existingUser.phone = phone;
    existingUser.password = hashedPassword;
    existingUser.role = 'admin';
    existingUser.emailVerified = true;
    await existingUser.save();

    console.log(`User promoted to admin: ${existingUser.email}`);
};

if (require.main === module) {
    main()
        .catch((error) => {
            console.error('Failed to bootstrap admin user:', error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            try {
                const mongoose = require('mongoose');
                await mongoose.connection.close();
            } catch {
                // Ignore shutdown cleanup issues.
            }
        });
}

module.exports = {
    main,
};