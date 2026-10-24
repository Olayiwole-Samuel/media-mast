const Station = require('../models/Station');

// ─────────────────────────────────────────────────────────────
// PER-STATION BOOKING LOCK
//
// Booking times are intervals (time + duration), so no unique index can
// express "no two active bookings overlap". Instead, booking creation
// holds a short lock on the Station document while it checks for
// conflicts and inserts. Taking the lock is a single atomic
// findOneAndUpdate, which works on a standalone MongoDB as well as a
// replica set (no transactions needed).
//
// The lock expires on its own (LOCK_TTL_MS) so a crashed request can't
// block a station. Release only clears our own lock value.
// ─────────────────────────────────────────────────────────────

const LOCK_TTL_MS = 5000;
const RETRY_DELAY_MS = 50;
const MAX_WAIT_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves to the lock value (a Date) once acquired, or null if the
// station stayed locked for MAX_WAIT_MS.
const acquireStationBookingLock = async (stationId) => {
    const deadline = Date.now() + MAX_WAIT_MS;

    for (;;) {
        const now = new Date();
        // Unique per acquisition: millisecond expiry plus a random offset.
        const lockUntil = new Date(now.getTime() + LOCK_TTL_MS + Math.floor(Math.random() * 1000));

        const locked = await Station.findOneAndUpdate(
            {
                _id: stationId,
                $or: [
                    { bookingLockUntil: null },
                    { bookingLockUntil: { $lte: now } },
                ],
            },
            { $set: { bookingLockUntil: lockUntil } },
            { timestamps: false, projection: { _id: 1 } }
        );

        if (locked) return lockUntil;

        if (Date.now() >= deadline) return null;

        await sleep(RETRY_DELAY_MS);
    }
};

const releaseStationBookingLock = async (stationId, lockUntil) => {
    try {
        await Station.updateOne(
            { _id: stationId, bookingLockUntil: lockUntil },
            { $set: { bookingLockUntil: null } },
            { timestamps: false }
        );
    } catch (error) {
        // The lock expires by itself; never fail the request over this.
        console.error('⚠️ Station booking lock release error:', error.message);
    }
};

module.exports = {
    LOCK_TTL_MS,
    acquireStationBookingLock,
    releaseStationBookingLock,
};
