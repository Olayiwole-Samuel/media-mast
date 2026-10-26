const crypto = require('crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const Station = require('../models/Station');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// CREATE DEMO ACCOUNTS
//
// Adds, to the database in MONGODB_URI:
//   • an approved company + its owner login
//   • an employee of that company (campaigns, bookings, creatives)
//   • an approved radio station (with a small rate card) + its manager
//
// Usage (from backend/):  node src/scripts/createDemoAccounts.js --yes
//
// Passwords are generated here and shown ONCE in this terminal — copy them.
// Safe to re-run: an email that already exists is left untouched.
// ─────────────────────────────────────────────────────────────

const DEMO = {
    company: { name: 'Demo Brands Ltd', slug: 'demo-brands-ltd', email: 'demo.company@example.com', owner: 'Demo Company Owner' },
    employee: { name: 'Demo Employee', email: 'demo.employee@example.com', position: 'Marketing Officer' },
    station: { name: 'Demo Lagos FM', slug: 'demo-lagos-fm', type: 'RADIO', manager: 'Demo Station Manager', email: 'demo.station@example.com' },
};

const EMPLOYEE_PERMISSIONS = [
    'CAMPAIGN_VIEW', 'CAMPAIGN_CREATE', 'CAMPAIGN_EDIT', 'CAMPAIGN_SUBMIT',
    'BOOKING_VIEW', 'BOOKING_CREATE',
    'CREATIVE_VIEW', 'CREATIVE_UPLOAD',
];

// Meets the sign-up rules: upper, lower, digit, symbol, 8+ characters.
const newPassword = () => `Mm-${crypto.randomBytes(8).toString('base64url').replace(/[-_]/g, 'x')}7a!`;

const created = [];

const ensureUser = async (fields) => {
    const existing = await User.findOne({ email: fields.email }).select('_id accountType');
    if (existing) {
        console.log(`• ${fields.email} already exists (${existing.accountType}) — left unchanged`);
        return existing;
    }
    const password = newPassword();
    const user = await User.create({ ...fields, password, status: 'ACTIVE', mustChangePassword: false });
    created.push({ role: fields.role, email: fields.email, password });
    return user;
};

const run = async () => {
    if (!process.argv.includes('--yes')) {
        console.error('This writes demo accounts to the database in MONGODB_URI. Re-run with --yes to continue.');
        process.exitCode = 1;
        return;
    }
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. No changes were made.');
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to database "${mongoose.connection.db.databaseName}"\n`);

        // ── Company + owner ──
        let company = await Company.findOne({ slug: DEMO.company.slug });
        if (!company) {
            company = await Company.create({ name: DEMO.company.name, slug: DEMO.company.slug, email: DEMO.company.email, status: 'APPROVED' });
        }
        const owner = await ensureUser({ role: 'Company owner', email: DEMO.company.email, name: DEMO.company.owner, accountType: 'COMPANY', companyId: company._id });
        if (owner.accountType === 'COMPANY' && !(await Employee.findOne({ userId: owner._id }))) {
            await Employee.create({ userId: owner._id, companyId: company._id, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true });
        }

        // ── Employee ──
        const emp = await ensureUser({ role: 'Employee', email: DEMO.employee.email, name: DEMO.employee.name, accountType: 'EMPLOYEE', companyId: company._id });
        if (emp.accountType === 'EMPLOYEE' && !(await Employee.findOne({ userId: emp._id }))) {
            await Employee.create({
                userId: emp._id, companyId: company._id, position: DEMO.employee.position,
                permissions: EMPLOYEE_PERMISSIONS, isActive: true, invitedAt: new Date(), invitedBy: owner._id, acceptedAt: new Date(),
            });
        }

        // ── Station + manager ──
        let station = await Station.findOne({ slug: DEMO.station.slug });
        if (!station) {
            station = await Station.create({
                name: DEMO.station.name,
                slug: DEMO.station.slug,
                type: DEMO.station.type,
                description: 'Demo radio station for walkthroughs.',
                location: { city: 'Lagos', state: 'Lagos' },
                pricing: { amount: 25000, currency: 'NGN', unit: 'SPOT' },
                approvalStatus: 'APPROVED',
                inventoryStatus: 'AVAILABLE',
                isActive: true,
                reach: 'Lagos metropolitan',
                rateCard: [
                    { name: 'Morning drive', kind: 'TIME_BELT', code: 'PRIME', startTime: '06:00', endTime: '10:00', spotSeconds: 30, price: 40000, isActive: true },
                    { name: 'Daytime', kind: 'TIME_BELT', code: 'REGULAR', startTime: '10:00', endTime: '16:00', spotSeconds: 30, price: 25000, isActive: true },
                    { name: 'Evening drive', kind: 'TIME_BELT', code: 'PRIME', startTime: '16:00', endTime: '20:00', spotSeconds: 30, price: 40000, isActive: true },
                ],
            });
        }
        const manager = await ensureUser({ role: 'Station manager', email: DEMO.station.email, name: DEMO.station.manager, accountType: 'STATION', companyId: null });
        if (manager.accountType === 'STATION') {
            await Station.updateOne({ _id: station._id }, { $addToSet: { managerIds: manager._id } });
        }

        console.log('\n================================');
        if (!created.length) {
            console.log('Nothing new: all demo accounts already existed.');
        } else {
            console.log('NEW LOGINS — copy these now, they are not shown again:\n');
            for (const c of created) console.log(`${c.role.padEnd(16)} ${c.email}   ${c.password}`);
        }
        console.log('================================\n');
    } catch (error) {
        const detail = error?.name === 'ValidationError' ? `: ${error.message}` : '';
        console.error(`Failed (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''})${detail}`);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
};

run();
