const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Station = require('../models/Station');
const { validateRateCard } = require('../validators/station.validator');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// RATE UPDATES from agency plans. Pick the set with --set:
//   agency-2026  (default) Nov 2026 agency plans: radio 30s / 45s, radio time
//                checks, TV 15s. Data: src/data/rateCards2026Agency.js
//   radio-plan   "Radio Media plan.xlsx": 30s jingles, Mon–Fri prime time,
//                26 radio stations. Data: src/data/rateCardsRadioPlan2026.js
//
// Usage (from backend/):
//   node src/scripts/importRateUpdate.js [--set=radio-plan]          preview (nothing changes)
//   node src/scripts/importRateUpdate.js [--set=radio-plan] --yes    apply
//
// Media houses already on the site: a rate with the same belt times, days,
// length and kind gets the new price; a rate they already sell at that
// price for those times (e.g. every day, which covers Mon–Fri) is left as it
// is; anything else is added. Their other rates stay as they are. New media houses are created live (approved,
// active) with these rates. Run createMediaHouseAccounts.js afterwards to
// give the new ones a login.
// ─────────────────────────────────────────────────────────────

const MAX_RATES = 150;
const SETS = {
    'agency-2026': { load: () => require('../data/rateCards2026Agency').RATE_UPDATE_2026, source: 'the November 2026 agency rate update' },
    'radio-plan': { load: () => require('../data/rateCardsRadioPlan2026').RATE_UPDATE_RADIO_PLAN, source: 'the 2026 radio media plan' },
};
// Same times, length and kind, sold on at least these days ([] = every day).
const sameSlot = (a, b) => keyOf({ ...a, days: [] }) === keyOf({ ...b, days: [] });
const coversDays = (have, want) => !(have.days || []).length || (want.days || []).every((d) => have.days.includes(d));
const keyOf = (r) => [r.kind, r.startTime || '', r.endTime || '', r.spotSeconds || '', [...(r.days || [])].sort().join(','), r.size || '', r.colour || ''].join('|');
const plain = (r) => ({ name: r.name, kind: r.kind, code: r.code || null, startTime: r.startTime || null, endTime: r.endTime || null, spotSeconds: r.spotSeconds ?? null, days: r.days || [], size: r.size || null, colour: r.colour || null, price: r.price, isActive: r.isActive !== false });

const run = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. Nothing was changed.');
        process.exitCode = 1;
        return;
    }
    const write = process.argv.includes('--yes');
    const setName = (process.argv.find((a) => a.startsWith('--set=')) || '--set=agency-2026').slice(6);
    if (!SETS[setName]) {
        console.error(`Unknown --set "${setName}". Use one of: ${Object.keys(SETS).join(', ')}. Nothing was changed.`);
        process.exitCode = 1;
        return;
    }
    const cards = SETS[setName].load();
    try {
        await require('../utils/database').connectWithDnsFallback(process.env.MONGODB_URI);
        console.log(`Database: "${mongoose.connection.db.databaseName}"${write ? '' : '  (preview: nothing will change)'}\n`);
        let created = 0, updatedPrices = 0, added = 0, unchanged = 0;

        for (const card of cards) {
            const existing = await Station.findOne({ slug: card.slug });
            if (existing) {
                const merged = (existing.rateCard || []).map((r) => plain(r.toObject ? r.toObject() : r));
                const index = new Map(merged.map((r, i) => [keyOf(r), i]));
                let up = 0, add = 0;
                for (const r of card.rateCard) {
                    const i = index.get(keyOf(r));
                    if (i === undefined && merged.some((m) => m.isActive !== false && sameSlot(m, r) && coversDays(m, r) && Number(m.price) === Number(r.price))) {
                        unchanged += 1; // already sold at this price on these days
                        continue;
                    }
                    if (i !== undefined) {
                        if (Number(merged[i].price) !== Number(r.price)) { merged[i].price = r.price; up += 1; } else unchanged += 1;
                        merged[i].isActive = true;
                    } else {
                        merged.push(plain(r));
                        index.set(keyOf(r), merged.length - 1);
                        add += 1;
                    }
                }
                if (merged.length > MAX_RATES) { console.log(`! ${existing.name}: would have ${merged.length} rates (max ${MAX_RATES}); skipped`); continue; }
                const check = validateRateCard({ rates: merged });
                if (check.errors) { console.log(`! ${existing.name}: ${check.errors.map((e) => e.message).join('; ')}; skipped`); continue; }
                console.log(`• ${existing.name}: ${up} price${up === 1 ? '' : 's'} updated, ${add} rate${add === 1 ? '' : 's'} added (${merged.length} in total)`);
                updatedPrices += up; added += add;
                if (write && (up || add)) {
                    existing.rateCard = check.value.rates;
                    existing.rateCardUpdatedAt = new Date();
                    if (existing.approvalStatus !== 'APPROVED' || existing.isActive === false) { existing.approvalStatus = 'APPROVED'; existing.isActive = true; }
                    await existing.save();
                }
                continue;
            }

            const check = validateRateCard({ rates: card.rateCard });
            if (check.errors) { console.log(`! ${card.name}: ${check.errors.map((e) => e.message).join('; ')}; skipped`); continue; }
            const where = [card.location.city, card.location.state].filter(Boolean).join(', ');
            console.log(`+ ${card.name} (${card.type}${where ? `, ${where}` : ''}): new, ${card.rateCard.length} rates`);
            created += 1; added += card.rateCard.length;
            if (write) {
                await Station.create({
                    name: card.name,
                    slug: card.slug,
                    type: card.type,
                    description: `${card.type === 'TV' ? 'TV station' : 'Radio station'}${where ? ` in ${where}` : ''}. Rates from ${SETS[setName].source}.`,
                    location: card.location,
                    pricing: { amount: Math.min(...card.rateCard.map((r) => r.price)), currency: 'NGN', unit: 'SPOT' },
                    approvalStatus: 'APPROVED',
                    inventoryStatus: 'AVAILABLE',
                    isActive: true,
                    rateCard: check.value.rates,
                    rateCardUpdatedAt: new Date(),
                });
            }
        }
        console.log(`\n${write ? 'Done' : 'Preview'}: ${created} new media house${created === 1 ? '' : 's'}, ${updatedPrices} price${updatedPrices === 1 ? '' : 's'} changed, ${added} rate${added === 1 ? '' : 's'} added, ${unchanged} already up to date.`);
        if (!write) console.log('Nothing was changed. Run again with --yes to apply.');
        else if (created) console.log('Give the new media houses a login: node src/scripts/createMediaHouseAccounts.js --yes');
    } catch (error) {
        const detail = error?.name === 'ValidationError' ? `: ${error.message}` : '';
        console.error(`Failed (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''})${detail}`);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
};

run();
