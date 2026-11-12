const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Company = require('../models/Company');
const Station = require('../models/Station');
const Creative = require('../models/Creative');
const Verification = require('../models/Verification');

// GET /admin/analytics — platform figures from real records only (no
// estimates): money (spot value, discounts, VAT, fees, refunds), the last six
// months, what sells (media type, spot length, top media houses), the
// business mix and approvals, and adverts with their ARCON certificates.

const MONTHS = 6;
const LIVE_BOOKING = ['PENDING', 'ACCEPTED', 'SCHEDULED', 'COMPLETED'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'NONE', r]));

const getAnalytics = async (req, res) => {
    try {
        const since = new Date();
        since.setUTCDate(1);
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCMonth(since.getUTCMonth() - (MONTHS - 1));

        const [
            money,
            paymentsByMonth,
            bookingsByMonth,
            byStatus,
            byLength,
            byStation,
            companyTypes,
            liveStations,
            verifications,
            creatives,
        ] = await Promise.all([
            Payment.aggregate([
                { $match: { status: { $in: ['SUCCESSFUL', 'REFUNDED'] } } },
                {
                    $group: {
                        _id: null,
                        checkouts: { $sum: 1 },
                        collected: { $sum: '$amount' },
                        spotValue: { $sum: { $ifNull: ['$subtotal', '$amount'] } },
                        discounts: { $sum: { $ifNull: ['$discount', 0] } },
                        vat: { $sum: { $ifNull: ['$vat', 0] } },
                        fees: { $sum: { $ifNull: ['$platformFee', 0] } },
                        refunds: { $sum: { $ifNull: ['$refundAmount', 0] } },
                    },
                },
            ]),
            Payment.aggregate([
                { $match: { status: { $in: ['SUCCESSFUL', 'REFUNDED'] }, createdAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, amount: { $sum: '$amount' }, vat: { $sum: { $ifNull: ['$vat', 0] } } } },
            ]),
            Booking.aggregate([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
            ]),
            Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$price' } } }]),
            Booking.aggregate([
                { $match: { status: { $in: LIVE_BOOKING } } },
                { $group: { _id: '$spotSeconds', count: { $sum: 1 }, value: { $sum: '$price' } } },
            ]),
            Booking.aggregate([
                { $match: { status: { $in: LIVE_BOOKING } } },
                { $group: { _id: '$stationId', count: { $sum: 1 }, value: { $sum: '$price' } } },
                { $sort: { value: -1 } },
                { $limit: 50 },
            ]),
            Company.aggregate([{ $group: { _id: '$companyType', count: { $sum: 1 } } }]),
            Station.countDocuments({ approvalStatus: 'APPROVED', isActive: true }),
            Verification.aggregate([{ $group: { _id: { status: '$status', kind: '$accountKind' }, count: { $sum: 1 } } }]),
            Creative.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 }, withArcon: { $sum: { $cond: [{ $ifNull: ['$arcon.fileId', false] }, 1, 0] } } } },
            ]),
        ]);

        // Media type of each booked station (one lookup for the stations involved).
        const stationDocs = await Station.find({ _id: { $in: byStation.map((r) => r._id).filter(Boolean) } }).select('name type');
        const stationById = new Map(stationDocs.map((s) => [String(s._id), s]));
        const byType = {};
        for (const r of byStation) {
            const type = stationById.get(String(r._id))?.type || 'OTHER';
            byType[type] = byType[type] || { count: 0, value: 0 };
            byType[type].count += r.count;
            byType[type].value += r.value;
        }

        const months = [];
        const cursor = new Date(since);
        const payMonth = byKey(paymentsByMonth);
        const bookMonth = byKey(bookingsByMonth);
        for (let i = 0; i < MONTHS; i++) {
            const key = cursor.toISOString().slice(0, 7);
            months.push({ month: key, bookings: bookMonth[key]?.count || 0, collected: round2(payMonth[key]?.amount), vat: round2(payMonth[key]?.vat) });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }

        const m = money[0] || {};
        const types = byKey(companyTypes);
        const approvals = { SUBMITTED: 0, APPROVED: 0, REJECTED: 0, DRAFT: 0 };
        const approvalsByKind = {};
        for (const v of verifications) {
            approvals[v._id.status] = (approvals[v._id.status] || 0) + v.count;
            approvalsByKind[v._id.kind] = approvalsByKind[v._id.kind] || {};
            approvalsByKind[v._id.kind][v._id.status] = v.count;
        }

        return res.json({
            success: true,
            data: {
                money: {
                    checkouts: m.checkouts || 0,
                    spotValue: round2(m.spotValue),
                    discounts: round2(m.discounts),
                    vat: round2(m.vat),
                    fees: round2(m.fees),
                    collected: round2(m.collected),
                    refunds: round2(m.refunds),
                    net: round2((m.collected || 0) - (m.refunds || 0)),
                },
                months,
                bookingsByStatus: byStatus.map((r) => ({ status: r._id, count: r.count, value: round2(r.value) })),
                bookingsByType: Object.entries(byType).map(([type, v]) => ({ type, count: v.count, value: round2(v.value) })).sort((a, b) => b.value - a.value),
                bookingsByLength: byLength.map((r) => ({ seconds: r._id || null, count: r.count, value: round2(r.value) })).sort((a, b) => (b.seconds || 0) - (a.seconds || 0)),
                topStations: byStation.slice(0, 5).map((r) => ({ name: stationById.get(String(r._id))?.name || 'Removed station', type: stationById.get(String(r._id))?.type || null, count: r.count, value: round2(r.value) })),
                businesses: {
                    mediaClients: (types.CLIENT?.count || 0) + (types.NONE?.count || 0),
                    mediaAgencies: types.AGENCY?.count || 0,
                    liveMediaHouses: liveStations,
                },
                approvals,
                approvalsByKind,
                adverts: creatives.map((c) => ({ type: c._id, count: c.count, withArcon: c.withArcon })),
            },
        });
    } catch (error) {
        console.error('❌ Admin analytics error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load analytics' });
    }
};

module.exports = { getAnalytics };
