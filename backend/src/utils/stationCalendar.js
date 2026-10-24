// ─────────────────────────────────────────────────
// STATION CALENDAR
//
// airtimeHours  per weekday: { start: "HH:mm", end: "HH:mm" } = bookable
//               window, null = off air that day. A weekday that isn't
//               listed (or an empty object) has no weekly limit.
// blackouts     blocked date ranges (inclusive, date-only). Without
//               startTime/endTime the whole day is blocked; with them,
//               only that window on each day of the range.
//
// Booking dates are date-only (stored as UTC midnight) and times are
// "HH:mm" station-local, so weekdays are taken from the date string.
// ─────────────────────────────────────────────────

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const WEEKDAY_LABEL = { SUNDAY: 'Sunday', MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday' };
const REASON_LABEL = { OFF_AIR: 'off air', MAINTENANCE: 'maintenance', HOLIDAY: 'holiday', FULLY_BOOKED: 'fully booked', OTHER: 'unavailable' };

const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

const dateOnlyOf = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const weekdayOf = (dateOnly) => WEEKDAYS[new Date(`${dateOnly}T00:00:00.000Z`).getUTCDay()];

// Does [start, end) on dateOnly overlap this blackout?
const blackoutCovers = (blackout, dateOnly, start, end) => {
    const from = dateOnlyOf(blackout.startDate);
    const to = dateOnlyOf(blackout.endDate);
    if (!from || !to || dateOnly < from || dateOnly > to) return false;
    if (!blackout.startTime || !blackout.endTime) return true;
    return start < toMinutes(blackout.endTime) && end > toMinutes(blackout.startTime);
};

// Error message for a booking request, or null when the calendar allows it.
const checkStationCalendar = (station, dateOnly, start, end) => {
    const weekday = weekdayOf(dateOnly);
    const hours = station.airtimeHours && typeof station.airtimeHours === 'object' ? station.airtimeHours : {};

    if (Object.prototype.hasOwnProperty.call(hours, weekday)) {
        const day = hours[weekday];
        if (!day) {
            return `This station is off air on ${WEEKDAY_LABEL[weekday]}s.`;
        }
        if (start < toMinutes(day.start) || end > toMinutes(day.end)) {
            return `This station only takes bookings between ${day.start} and ${day.end} on ${WEEKDAY_LABEL[weekday]}s.`;
        }
    }

    const blocked = (station.blackouts || []).find((b) => blackoutCovers(b, dateOnly, start, end));
    if (blocked) {
        const when = blocked.startTime ? ` between ${blocked.startTime} and ${blocked.endTime}` : '';
        return `This station is not available on ${dateOnly}${when} (${REASON_LABEL[blocked.reason] || 'unavailable'}).`;
    }

    return null;
};

// Does an existing booking fall inside this blackout?
const bookingInBlackout = (booking, blackout) => {
    const dateOnly = dateOnlyOf(booking.date);
    if (!dateOnly) return false;
    const start = toMinutes(booking.time);
    return blackoutCovers(blackout, dateOnly, start, start + Number(booking.duration || 0));
};

// What advertisers may see: no internal notes or authors.
const publicCalendar = (station, fromDateOnly) => ({
    airtimeHours: station.airtimeHours || {},
    blackouts: (station.blackouts || [])
        .filter((b) => !fromDateOnly || dateOnlyOf(b.endDate) >= fromDateOnly)
        .map((b) => ({
            startDate: dateOnlyOf(b.startDate),
            endDate: dateOnlyOf(b.endDate),
            startTime: b.startTime || null,
            endTime: b.endTime || null,
            reason: b.reason,
        })),
});

module.exports = {
    WEEKDAYS,
    REASON_LABEL,
    toMinutes,
    dateOnlyOf,
    checkStationCalendar,
    bookingInBlackout,
    publicCalendar,
};
