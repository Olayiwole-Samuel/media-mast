const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Station = require('../models/Station');
const { RATE_CARD_STATIONS } = require('../data/rateCards');
const { validateRateCard } = require('../validators/station.validator');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// LOAD THE REAL TV RATE CARDS (NTA Group A, Channels, TVC)
//
// Usage (from backend/):  node src/scripts/createRateCardStations.js --yes
//
// Add --only to make these the only bookable stations: every other station
// is switched off (isActive=false). Nothing is deleted — bookings, history and
// manager logins stay, and an admin can switch any station back on.
//
// Creates each station (approved, live) with its rate card from
// src/data/rateCards.js, or — if it already exists (same slug) — replaces
// only its rate card, so prices can be refreshed by running it again.
// Managers are added afterwards by an admin (Admin → Stations).
// ─────────────────────────────────────────────────────────────

const lowestPrice = (rates) => Math.min(...rates.map((r) => r.price));

const run = async () => {
    if (!process.argv.includes('--yes')) {
        console.error('This writes stations to the database in MONGODB_URI. Re-run with --yes to continue.');
        process.exitCode = 1;
        return;
    }
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. No changes were made.');
        process.exitCode = 1;
        return;
    }

    // Check every card against the same rules stations use, before writing.
    for (const card of RATE_CARD_STATIONS) {
        const check = validateRateCard({ rates: card.rateCard });
        if (check.errors) {
            console.error(`Rate card for ${card.name} is invalid: ${check.errors.map((e) => e.message).join('; ')}`);
            process.exitCode = 1;
            return;
        }
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to database "${mongoose.connection.db.databaseName}"\n`);

        for (const card of RATE_CARD_STATIONS) {
            const { rates } = validateRateCard({ rates: card.rateCard }).value;
            const existing = await Station.findOne({ slug: card.slug });
            if (existing) {
                existing.rateCard = rates;
                await existing.save();
                console.log(`• ${card.name}: rate card refreshed (${rates.length} rates)`);
                continue;
            }
            await Station.create({
                name: card.name,
                slug: card.slug,
                type: card.type,
                description: card.description,
                location: card.location,
                website: card.website || null,
                email: card.email || null,
                phone: card.phone || null,
                reach: card.reach || null,
                pricing: { amount: lowestPrice(rates), currency: 'NGN', unit: 'SPOT' },
                approvalStatus: 'APPROVED',
                inventoryStatus: 'AVAILABLE',
                isActive: true,
                rateCard: rates,
            });
            console.log(`• ${card.name}: created with ${rates.length} rates`);
        }
        if (process.argv.includes('--only')) {
            const keep = RATE_CARD_STATIONS.map((c) => c.slug);
            const others = await Station.find({ slug: { $nin: keep }, isActive: true }).select('name');
            if (others.length) {
                await Station.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { isActive: false } });
                console.log(`\nSwitched off ${others.length} other station(s) (not deleted):`);
                for (const o of others) console.log(`  - ${o.name}`);
            } else {
                console.log('\nNo other stations were switched on.');
            }
        }
        console.log('\nDone. Add managers for these stations in Admin → Media houses.');
    } catch (error) {
        const detail = error?.name === 'ValidationError' ? `: ${error.message}` : '';
        console.error(`Failed (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''})${detail}`);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
};

run();
