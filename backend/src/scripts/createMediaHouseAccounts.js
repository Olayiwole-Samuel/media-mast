const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Station = require('../models/Station');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// ONE LOGIN FOR EVERY MEDIA HOUSE
//
// Usage (from backend/):
//   node src/scripts/createMediaHouseAccounts.js              (preview only)
//   node src/scripts/createMediaHouseAccounts.js --yes        (create them)
//   node src/scripts/createMediaHouseAccounts.js --yes --domain=yourdomain.com
//
// For every live, approved media house that has no manager yet, creates a
// media house (STATION) login and assigns it to that station, so the house
// can confirm each booking or ask the advertiser to reschedule.
//
//   • Email: <station-slug>@<domain> (default domain: example.com — a
//     placeholder that never receives mail; replace with the real address
//     in Admin → Station managers when the media house gives you one).
//   • Password: random; the media house must change it at first sign-in.
//
// The logins are written to backend/media-house-logins.csv (ignored by git)
// and NOT printed here. Share each one privately, then delete the file.
// Running it again skips stations that already have a manager.
// ─────────────────────────────────────────────────────────────

// Meets the sign-up rules: upper, lower, digit, symbol, 8+ characters.
const newPassword = () => `Mm-${crypto.randomBytes(8).toString('base64url').replace(/[-_]/g, 'x')}7a!`;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const arg = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
};

const run = async () => {
    const write = process.argv.includes('--yes');
    const domain = (arg('domain') || 'example.com').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
        console.error(`"${domain}" isn't a valid email domain. No changes were made.`);
        process.exitCode = 1;
        return;
    }
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. No changes were made.');
        process.exitCode = 1;
        return;
    }

    const outFile = path.join(__dirname, '..', '..', 'media-house-logins.csv');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to database "${mongoose.connection.db.databaseName}"\n`);

        const stations = await Station.find({ isActive: true, approvalStatus: 'APPROVED' })
            .select('name slug type managerIds')
            .sort({ name: 1 });

        // A station counts as covered if any of its managers still exists.
        const managerIds = stations.flatMap((s) => s.managerIds || []);
        const liveManagers = new Set((await User.find({ _id: { $in: managerIds }, accountType: 'STATION' }).select('_id'))
            .map((u) => String(u._id)));
        const todo = stations.filter((s) => !(s.managerIds || []).some((id) => liveManagers.has(String(id))));

        console.log(`${stations.length} live media houses · ${stations.length - todo.length} already have a login · ${todo.length} need one\n`);
        if (!todo.length) return;

        if (!write) {
            for (const s of todo) console.log(`  - ${s.name}  →  ${s.slug}@${domain}`);
            console.log('\nPreview only. Re-run with --yes to create these logins.');
            return;
        }

        const rows = [];
        for (const station of todo) {
            const email = `${station.slug}@${domain}`;
            const existing = await User.findOne({ email }).select('_id accountType');
            if (existing) {
                if (existing.accountType === 'STATION') {
                    await Station.updateOne({ _id: station._id }, { $addToSet: { managerIds: existing._id } });
                    console.log(`• ${station.name}: existing login ${email} assigned`);
                } else {
                    console.log(`• ${station.name}: skipped, ${email} is already used by another kind of account`);
                }
                continue;
            }
            const password = newPassword();
            const user = await User.create({
                name: station.name,
                email,
                password, // hashed by the User pre-save hook
                accountType: 'STATION',
                status: 'ACTIVE',
                companyId: null,
                mustChangePassword: true,
            });
            await Station.updateOne({ _id: station._id }, { $addToSet: { managerIds: user._id } });
            rows.push([station.name, station.type, email, password]);
            console.log(`• ${station.name}: login created (${email})`);
        }

        if (rows.length) {
            const csv = [['Media house', 'Type', 'Email', 'Temporary password'], ...rows]
                .map((r) => r.map(csvCell).join(',')).join('\r\n');
            // Append if an earlier run left a file, so no login is lost.
            const exists = fs.existsSync(outFile);
            fs.writeFileSync(outFile, exists ? `\r\n${csv.split('\r\n').slice(1).join('\r\n')}` : csv, { flag: exists ? 'a' : 'w', mode: 0o600 });
        }
        console.log(`\nDone: ${rows.length} login(s) created.`);
        if (rows.length) console.log(`Emails and temporary passwords are in ${outFile}. Share each privately, then delete the file.`);
    } catch (error) {
        const detail = error?.name === 'ValidationError' ? `: ${error.message}` : '';
        console.error(`Failed (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''})${detail}`);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
};

run();
