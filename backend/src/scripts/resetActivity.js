const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// START AFRESH: clear all campaign activity, keep the media houses.
//
// Usage (from backend/):
//   node src/scripts/resetActivity.js                      preview only (counts, nothing deleted)
//   node src/scripts/resetActivity.js --yes --confirm=<database name>
//   add --accounts to also delete agency / brand accounts (logins, companies,
//   their verifications); without it those accounts stay and can log in.
//
// KEPT: media houses (stations: rate cards, calendars, managers, bank
// accounts), media house logins, admin accounts, plans and settings, media
// house verifications.
// DELETED: campaigns, bookings, payments, adverts (and their files), proof
// of airing files, wallets and wallet history (advertisers' and media
// houses' earnings), saved plans and review links, payout requests, volume
// discount agreements, notifications, activity log, subscriptions,
// documents, unfinished uploads.
//
// This cannot be undone. It asks for --confirm=<the database name it
// connected to> so it can't be run against the wrong database by accident.
// ─────────────────────────────────────────────────────────────

const ACTIVITY = [
    'campaigns', 'bookings', 'payments', 'creatives', 'wallets', 'wallettransactions', 'fundingintents',
    'plandrafts', 'planshares', 'payoutrequests', 'volumeagreements', 'notifications',
    'auditlogs', 'subscriptions', 'schedules', 'uploadsessions',
];
const FILE_BUCKETS = ['creatives', 'proofs', 'documents'];

const run = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. Nothing was changed.');
        process.exitCode = 1;
        return;
    }
    const write = process.argv.includes('--yes');
    const accounts = process.argv.includes('--accounts');
    const confirm = (process.argv.find((a) => a.startsWith('--confirm=')) || '').slice('--confirm='.length);

    try {
        await require('../utils/database').connectWithDnsFallback(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const name = db.databaseName;
        console.log(`Database: "${name}"\n`);
        const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
        const count = async (c, f = {}) => (existing.has(c) ? db.collection(c).countDocuments(f) : 0);

        // What would go.
        const plan = [];
        for (const c of ACTIVITY) plan.push({ label: c, collection: c, filter: {}, n: await count(c) });
        for (const b of FILE_BUCKETS) plan.push({ label: `${b} files`, collection: `${b}.files`, filter: {}, n: await count(`${b}.files`), chunks: `${b}.chunks` });

        const advertiserTypes = ['COMPANY', 'INDIVIDUAL', 'EMPLOYEE'];
        if (accounts) {
            const users = existing.has('users') ? await db.collection('users').find({ accountType: { $in: advertiserTypes } }).project({ _id: 1, companyId: 1 }).toArray() : [];
            const stationCompanies = existing.has('stations') ? (await db.collection('stations').distinct('companyId')).filter(Boolean).map(String) : [];
            const companyIds = [...new Set(users.map((u) => u.companyId).filter(Boolean).map(String))].filter((id) => !stationCompanies.includes(id));
            plan.push({ label: 'agency / brand logins', collection: 'users', filter: { accountType: { $in: advertiserTypes } }, n: users.length });
            plan.push({ label: 'agency / brand companies', collection: 'companies', filter: { _id: { $in: companyIds.map((id) => new mongoose.Types.ObjectId(id)) } }, n: companyIds.length });
            plan.push({ label: 'agency / brand verifications', collection: 'verifications', filter: { accountKind: { $in: ['CLIENT', 'AGENCY'] } }, n: await count('verifications', { accountKind: { $in: ['CLIENT', 'AGENCY'] } }) });
            plan.push({ label: 'team members', collection: 'employees', filter: {}, n: await count('employees') });
            plan.push({ label: 'departments', collection: 'departments', filter: {}, n: await count('departments') });
        }

        console.log(write ? 'Deleting:' : 'Would delete:');
        for (const p of plan) console.log(`  ${p.label.padEnd(30)} ${p.n}`);
        console.log('\nKeeping:');
        console.log(`  ${'media houses (rate cards etc.)'.padEnd(30)} ${await count('stations')}`);
        console.log(`  ${'media house logins'.padEnd(30)} ${await count('users', { accountType: 'STATION' })}`);
        console.log(`  ${'admin logins'.padEnd(30)} ${await count('users', { accountType: 'ADMIN' })}`);
        if (!accounts) console.log(`  ${'agency / brand logins'.padEnd(30)} ${await count('users', { accountType: { $in: advertiserTypes } })}  (add --accounts to delete them too)`);

        if (!write) {
            console.log(`\nPreview only: nothing was deleted. To delete, run again with:\n  --yes --confirm=${name}${accounts ? ' --accounts' : ''}`);
            return;
        }
        if (confirm !== name) {
            console.error(`\nNot deleted: add --confirm=${name} to confirm this is the database to clear.`);
            process.exitCode = 1;
            return;
        }

        for (const p of plan) {
            if (!existing.has(p.collection)) continue;
            await db.collection(p.collection).deleteMany(p.filter);
            if (p.chunks && existing.has(p.chunks)) await db.collection(p.chunks).deleteMany({});
        }
        // Media houses stay, minus leftovers from the deleted activity.
        if (existing.has('stations')) await db.collection('stations').updateMany({}, { $set: { briefingSentOn: null, bookingLockUntil: null } });
        console.log('\nDone. Campaign activity cleared; media houses and their rate cards are intact.');
    } catch (error) {
        console.error(`Failed (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''}). Some data may already be deleted; run the preview to see what is left.`);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
};

run();
