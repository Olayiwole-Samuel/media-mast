const Booking = require('../models/Booking');
const { INDUSTRY_SPEND } = require('../data/industrySpend');

// ─────────────────────────────────────────────────────────────
// SPEND INSIGHTS
// Published industry estimates (data/industrySpend.js, with sources) next
// to real spend on Media Masters: paid bookings by channel, by station and
// by state. Platform figures are totals across all advertisers; no
// advertiser's own bookings can be picked out.
// ─────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

const getSpendInsights = async (req, res) => {
    try {
        const bookings = await Booking.find({
            paymentStatus: 'PAID',
            status: { $nin: ['REJECTED', 'CANCELLED'] },
        })
            .select('stationId price currency')
            .populate('stationId', 'name type location');

        const byType = new Map();
        const byStation = new Map();
        const byState = new Map();
        let total = 0;
        let currency = 'NGN';

        for (const b of bookings) {
            const st = b.stationId;
            if (!st) continue;
            const price = Number(b.price) || 0;
            currency = b.currency || currency;
            total += price;

            const t = byType.get(st.type) || { type: st.type, amount: 0, bookings: 0 };
            t.amount += price; t.bookings += 1; byType.set(st.type, t);

            const key = String(st._id);
            const s = byStation.get(key) || { stationId: key, name: st.name, type: st.type, state: st.location?.state || null, amount: 0, bookings: 0 };
            s.amount += price; s.bookings += 1; byStation.set(key, s);

            const stateName = st.location?.state || 'Unknown';
            const g = byState.get(stateName) || { state: stateName, amount: 0, bookings: 0 };
            g.amount += price; g.bookings += 1; byState.set(stateName, g);
        }

        const sortDesc = (a, b) => b.amount - a.amount;
        return res.json({
            success: true,
            data: {
                industry: INDUSTRY_SPEND,
                platform: {
                    currency,
                    total: round2(total),
                    bookings: bookings.length,
                    byChannel: [...byType.values()].map((t) => ({ ...t, amount: round2(t.amount) })).sort(sortDesc),
                    topStations: [...byStation.values()]
                        .map((s) => ({ ...s, amount: round2(s.amount) }))
                        .sort(sortDesc)
                        .slice(0, 10),
                    byState: [...byState.values()].map((g) => ({ ...g, amount: round2(g.amount) })).sort(sortDesc),
                },
            },
        });
    } catch (error) {
        console.error('❌ Spend insights error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load spend insights' });
    }
};

module.exports = { getSpendInsights };
