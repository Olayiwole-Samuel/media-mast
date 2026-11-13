// Shared rate-card helpers: how a station's rates are grouped and shown, and
// the booking fields a rate implies (same rules as the server's
// bookingHelpers.rateBookingFields, which decides at checkout).

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Days a rate is sold (0 = Sunday … 6 = Saturday); empty = every day.
export const daysLabel = (days) => {
    const d = [...(days || [])].sort((a, b) => a - b);
    if (!d.length || d.length === 7) return "";
    const key = d.join(",");
    if (key === "1,2,3,4,5") return "Mon–Fri";
    if (key === "0,6") return "Sat & Sun";
    return d.map((n) => DAY_NAMES[n]).join(", ");
};

export const weekdayOf = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`).getUTCDay();
export const soldOn = (rate, dateOnly) => !rate?.days?.length || !dateOnly || rate.days.includes(weekdayOf(dateOnly));

const minutes = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };

// A time belt books its window; a placement (programme spot, press, billboard) the day.
export const fieldsFromRate = (station, rate) => {
    if (rate.kind === "TIME_BELT" && rate.startTime && rate.endTime) {
        const s = minutes(rate.startTime), e = minutes(rate.endTime);
        const window = e > s ? e - s : 1440 - s + e;
        const slot = s >= 300 && s < 720 ? "MORNING" : s >= 720 && s < 960 ? "AFTERNOON" : s >= 960 && s < 1260 ? "PRIME_TIME" : "LATE_NIGHT";
        return { time: rate.startTime, duration: Math.max(1, Math.min(window, 1440 - s)), slot };
    }
    return { time: "06:00", duration: 1, slot: station.type === "PRESS" ? "EDITION" : station.type === "BILLBOARD" ? "DISPLAY" : "PROGRAMME" };
};

// Rate rows → one group per belt / programme / placement, each with its spot lengths.
export const groupRates = (rates) => {
    const map = new Map();
    for (const r of rates || []) {
        if (!r || r.isActive === false) continue;
        const key = [r.name, r.kind, r.startTime || "", r.endTime || "", r.size || "", r.colour || "", (r.days || []).join("")].join("|");
        if (!map.has(key)) map.set(key, { key, name: r.name, kind: r.kind, startTime: r.startTime, endTime: r.endTime, size: r.size, colour: r.colour, days: r.days || [], options: [] });
        map.get(key).options.push(r);
    }
    for (const g of map.values()) g.options.sort((a, b) => (b.spotSeconds || 0) - (a.spotSeconds || 0));
    return [...map.values()];
};

// The spot lengths a card uses, longest first (e.g. [60, 45, 30, 15, 5]).
export const cardLengths = (rates) => [...new Set((rates || []).filter((r) => r && r.isActive !== false).map((r) => r.spotSeconds).filter(Boolean))].sort((a, b) => b - a);

export const groupWhen = (g) => {
    if (g.kind === "TIME_BELT" && g.startTime) return `${g.startTime}–${g.endTime}`;
    if (g.size) return `${g.size}${g.colour === "BLACK_WHITE" ? " · B&W" : g.colour ? " · colour" : ""}`;
    return "In programme";
};
