const Booking = require('../models/Booking');

// ─────────────────────────────────────────────────────────────
// BOOKING STATUS TRANSITIONS
//
// The Booking schema enum answers "is this a known status?".
// These maps answer "may this actor move a booking from its current
// status to that one?". Every booking status change goes through a
// dedicated action endpoint that checks this map; there is no generic
// status update.
//
//   CUSTOMER  the company that made the booking (booking.companyId):
//             cancel (POST /bookings/:id/cancel) and resubmit after the
//             station asked for changes.
//
//   STATION   the media company that owns the booked station
//             (Station.companyId, assigned by an admin): accept, reject,
//             request changes, schedule, complete. Proof upload does not
//             change status but is station-only too.
//
// There are no LIVE / PROOF_UPLOADED / COMPANY_REVIEW booking statuses;
// broadcast proof is recorded on SCHEDULED bookings (proofUrl) and is
// required before the station can mark a booking COMPLETED.
// ─────────────────────────────────────────────────────────────

const BOOKING_STATUSES = Booking.schema.path('status').enumValues;

const BOOKING_STATUS_TRANSITIONS = {
    // Advertiser cancellations follow utils/cancellationPolicy.js (refund
    // depends on campaign progress and how close the spot is to airing).
    CUSTOMER: {
        PENDING: ['CANCELLED'],
        ACCEPTED: ['CANCELLED'],
        SCHEDULED: ['CANCELLED'],
        CHANGES_REQUESTED: ['PENDING', 'CANCELLED'],
    },

    STATION: {
        PENDING: ['ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED'],
        ACCEPTED: ['SCHEDULED'],
        SCHEDULED: ['COMPLETED'],
    },
};

const canTransitionBookingStatus = (actor, fromStatus, toStatus) =>
    (BOOKING_STATUS_TRANSITIONS[actor]?.[fromStatus] || []).includes(toStatus);

// ── Inventory ──
// A booking holds its station time from creation until it is rejected or
// cancelled. CHANGES_REQUESTED keeps the hold (the same booking is
// resubmitted), and COMPLETED keeps it because that airtime was used.
const INVENTORY_RELEASING_STATUSES = ['REJECTED', 'CANCELLED'];

const INVENTORY_HOLDING_STATUSES = BOOKING_STATUSES.filter(
    (status) => !INVENTORY_RELEASING_STATUSES.includes(status)
);

module.exports = {
    BOOKING_STATUSES,
    BOOKING_STATUS_TRANSITIONS,
    INVENTORY_RELEASING_STATUSES,
    INVENTORY_HOLDING_STATUSES,
    canTransitionBookingStatus,
};
