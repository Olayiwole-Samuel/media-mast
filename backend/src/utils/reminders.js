// ─────────────────────────────────────────────────────────────
// SLOT REMINDERS — 24 hours and 1 hour before a spot airs.
//
// runReminders() looks at accepted/scheduled spots airing within the next
// 24 hours and sends each reminder once (the booking records when it went).
// It is safe to run as often as you like: on the standalone server it runs
// every few minutes; on Vercel call POST /api/v1/jobs/reminders from a cron
// service (e.g. every 10 minutes) with "Authorization: Bearer <CRON_SECRET>".
// ─────────────────────────────────────────────────────────────

const Booking = require('../models/Booking');
const { airTimeOf } = require('./cancellationPolicy');
const { notifySlotReminder } = require('./notifications');

const HOUR = 3600000;
const REMINDER_STATUSES = ['ACCEPTED', 'SCHEDULED'];

const dayStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const runReminders = async (now = new Date()) => {
    // Booking dates are stored as date-only (UTC midnight): look a day either side.
    const from = new Date(dayStart(now).getTime() - 24 * HOUR);
    const to = new Date(dayStart(now).getTime() + 3 * 24 * HOUR);
    const candidates = await Booking.find({
        status: { $in: REMINDER_STATUSES },
        date: { $gte: from, $lte: to },
    });

    const sent = { day: 0, hour: 0 };
    for (const booking of candidates) {
        const untilAir = airTimeOf(booking).getTime() - now.getTime();
        if (untilAir <= 0) continue;

        // 1-hour reminder (also covers a spot booked late, inside 24 hours).
        if (untilAir <= HOUR && !booking.reminder1SentAt) {
            const claimed = await Booking.updateOne(
                { _id: booking._id, reminder1SentAt: null },
                { $set: { reminder1SentAt: now, ...(booking.reminder24SentAt ? {} : { reminder24SentAt: now }) } }
            );
            if (claimed.modifiedCount) {
                await notifySlotReminder(booking, { hours: 1 });
                sent.hour += 1;
            }
            continue;
        }

        if (untilAir <= 24 * HOUR && untilAir > HOUR && !booking.reminder24SentAt) {
            const claimed = await Booking.updateOne(
                { _id: booking._id, reminder24SentAt: null },
                { $set: { reminder24SentAt: now } }
            );
            if (claimed.modifiedCount) {
                await notifySlotReminder(booking, { hours: 24 });
                sent.day += 1;
            }
        }
    }
    return { checked: candidates.length, ...sent };
};

// Money held until airing: pay out spots whose dispute window has passed,
// chase media houses that haven't confirmed, settle closed holds.
const runSettlementJob = async (now = new Date()) => {
    const escrow = require('./escrow');
    const { notifyAirOverdue, notifyStationEarning } = require('./notifications');
    const before = await Booking.find({ 'escrow.status': 'AIRED', 'escrow.releaseAt': { $lte: now } }).select('_id');
    const result = await escrow.runSettlement(now, { notifyOverdue: notifyAirOverdue });
    for (const { _id } of before) {
        const b = await Booking.findById(_id);
        if (b && b.escrow?.status === 'RELEASED') await notifyStationEarning(b, b.escrow.stationAmount);
    }
    return result;
};

// Morning briefing: from 07:00 Lagos time, each media house with spots today
// gets one message ("Today: 12 spots across 3 campaigns") and a run sheet link.
const runBriefings = async (now = new Date()) => {
    const lagos = new Date(now.getTime() + 3600000);
    if (lagos.getUTCHours() < 7) return { sent: 0 };
    const today = lagos.toISOString().slice(0, 10);
    const dayStartUtc = new Date(`${today}T00:00:00.000Z`);
    const bookings = await Booking.find({ date: dayStartUtc, status: { $in: ['PENDING', 'ACCEPTED', 'SCHEDULED'] } });
    const byStation = new Map();
    for (const b of bookings) {
        const k = String(b.stationId);
        if (!byStation.has(k)) byStation.set(k, []);
        byStation.get(k).push(b);
    }
    const Station = require('../models/Station');
    const { notifyMorningBriefing } = require('./notifications');
    let sent = 0;
    for (const [stationId, list] of byStation) {
        const claimed = await Station.updateOne({ _id: stationId, briefingSentOn: { $ne: today } }, { $set: { briefingSentOn: today } });
        if (!claimed.modifiedCount) continue;
        await notifyMorningBriefing(stationId, list, today);
        sent += 1;
    }
    return { sent };
};

module.exports = { runReminders, runSettlementJob, runBriefings, REMINDER_STATUSES };
