const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Station = require('../models/Station');
const { RATE_UPDATE_2026 } = require('../data/rateCards2026Agency');
const { validateRateCard } = require('../validators/station.validator');

dotenv.config({ quiet: true });

// ─────────────────────────────────────────────────────────────
// RATE UPDATE (agency plans, Nov 2026): radio 30s / 45s, radio time checks,
// TV 15s. Data: src/data/rateCards2026Agency.js.
//
// Usage (from backend/):
//   node src/scripts/importRateUpdate.js          preview (nothing changes)
//   node src/scripts/importRateUpdate.js --yes    apply
//
// Media houses already on the site: a rate with the same belt times, days,
// length and kind gets the new price; anything else is added. Their other
// rates stay as they are. New media houses are created live (approved,
// active) with these rates. Run createMediaHouseAccounts.js afterwards to
// give the new ones a login.
// ─────────────────────────────────────────────────────────────

const MAX_RATES = 150;
const keyOf = (r) => [r.kind, r.startTime || '', r.endTime || '', r.spotSeconds || '', [...(r.days || [])].sort().join(','), r.size || '', r.colour || ''].join('|');
const plain = (r) => ({ name: r.name, kind: r.kind, code: r.code || null, startTime: r.startTime || null, endTime: r.endTime || null, spotSeconds: r.spotSeconds ?? null, days: r.days || [], size: r.size || null, colour: r.colour || null, price: r.price, isActive: r.isActive !== false });

const run = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set. Nothing was changed.');
        process.exitCode = 1;
        return;
    }
    const write = process.argv.includes('--yes');
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Database: "${mongoose.connection.db.databaseName}"${write ? '' : '  (preview: nothing will change)'}\n`);
        let created = 0, updatedPrices = 0, added = 0, unchanged = 0;

        for (const card of RATE_UPDATE_2026) {
            const existing = await Station.findOne({ slug: card.slug });
            if (existing) {
                const merged = (existing.rateCard || []).map((r) => plain(r.toObject ? r.toObject() : r));
                const index = new Map(merged.map((r, i) => [keyOf(r), i]));
                let up = 0, add = 0;
                for (const r of card.rateCard) {
                    const i = index.get(keyOf(r));
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
                    description: `${card.type === 'TV' ? 'TV station' : 'Radio station'}${where ? ` in ${where}` : ''}. Rates from the November 2026 agency rate update.`,
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
