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

module.exports = { runReminders, REMINDER_STATUSES };
