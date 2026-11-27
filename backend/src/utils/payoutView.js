const { round2 } = require('./wallet');

// A payout request as the admin page and the media house see it.
const publicPayout = (p, stationName) => ({
    _id: p._id, stationId: p.stationId, stationName: stationName || null, amount: round2(p.amount), currency: p.currency || 'NGN',
    status: p.status, account: p.account, reference: p.reference, note: p.note, createdAt: p.createdAt, decidedAt: p.decidedAt,
    provider: p.provider || 'MANUAL', mode: p.mode || null, transferStatus: p.transferStatus || null, failure: p.failure || null, sentAt: p.sentAt || null,
});

module.exports = { publicPayout };
