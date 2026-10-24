// Mirror of backend/src/utils/stationCalendar.js for instant feedback while
// picking a spot. UX only: the server checks again at checkout.

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const WEEKDAY_LABEL = { SUNDAY: "Sunday", MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday" };
export const REASON_LABEL = { OFF_AIR: "off air", MAINTENANCE: "maintenance", HOLIDAY: "holiday", FULLY_BOOKED: "fully booked", OTHER: "unavailable" };

const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
};

export const weekdayOf = (dateOnly) => WEEKDAYS[new Date(`${dateOnly}T00:00:00.000Z`).getUTCDay()];

// Message when the station can't take this spot, or "".
export const calendarProblem = (availability, dateOnly, time, duration) => {
    if (!availability || !dateOnly || !time) return "";
    const start = toMinutes(time);
    const end = start + Number(duration || 0);
    const weekday = weekdayOf(dateOnly);
    const hours = availability.airtimeHours || {};

    if (Object.prototype.hasOwnProperty.call(hours, weekday)) {
        const day = hours[weekday];
        if (!day) return `This station is off air on ${WEEKDAY_LABEL[weekday]}s.`;
        if (start < toMinutes(day.start) || end > toMinutes(day.end)) {
            return `This station only takes bookings between ${day.start} and ${day.end} on ${WEEKDAY_LABEL[weekday]}s.`;
        }
    }

    const blocked = (availability.blackouts || []).find((b) => {
        if (dateOnly < b.startDate || dateOnly > b.endDate) return false;
        if (!b.startTime || !b.endTime) return true;
        return start < toMinutes(b.endTime) && end > toMinutes(b.startTime);
    });
    if (blocked) {
        return `This station is not available on ${dateOnly}${blocked.startTime ? ` between ${blocked.startTime} and ${blocked.endTime}` : ""} (${REASON_LABEL[blocked.reason] || "unavailable"}).`;
    }
    return "";
};
