const { getVatPercent } = require('./payments');
const { checkStationCalendar } = require('./stationCalendar');

// ─────────────────────────────────────────────────────────────
// MEDIA PLANS: a campaign over a period (e.g. 6 months), built line by line
// like an agency media plan:
//
//   line = media house · programme/belt (rate card row, i.e. spot length) ·
//          spots for each weekday (e.g. Mon 2, Tue 1, Thu 3) ·
//          optionally its own date range inside the campaign
//
// Each line becomes one spot per airing day (× spots per day) on every
// matching date in the range. Price per spot, as on the plan:
//
//   gross (rate card) − volume discount % (the agency's agreement with that
//   media house, entered by the agency and confirmed by the media house) −
//   agency commission % (15%, media agencies only) = net
//   + VAT (7.5% of net) = total
//
// The advertiser's wallet holds the whole plan's total at checkout; each
// spot's money is paid to the media house as it airs (utils/escrow.js).
// ─────────────────────────────────────────────────────────────

const MAX_PLAN_SPOTS = 5000;
const MAX_LINES = 300;
const MAX_SPOTS_PER_DAY = 20;
const DAY_MS = 864e5;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const agencyCommissionPercent = () => {
    const n = Number(process.env.AGENCY_COMMISSION_PERCENT);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? n : 15;
};

// A programme / belt / placement whatever its spot length (60s and 30s of
// "News at 10" share one volume discount).
const programmeKey = (r) => [r.name, r.kind, r.startTime || '', r.endTime || '', r.size || '', r.colour || ''].join('|');

// The volume discount from an agreement (media house default, or the
// programme's own %). No confirmed agreement → 0.
const volumeDiscountFor = (agreement, rate) => {
    if (!agreement) return 0;
    const own = (agreement.programmes || []).find((p) => p && p.key === programmeKey(rate) && p.percent != null);
    const pct = own ? Number(own.percent) : Number(agreement.percent || 0);
    return Number.isFinite(pct) ? Math.min(90, Math.max(0, pct)) : 0;
};

// Spots for each weekday (0 = Sunday … 6 = Saturday). Accepts
// { spotsByDay: { "1": 2, "2": 1 } } or [7 counts], or the older
// { days: [..], spotsPerDay: n }.
const readSpotsByDay = (raw) => {
    const out = [0, 0, 0, 0, 0, 0, 0];
    if (raw && raw.spotsByDay && typeof raw.spotsByDay === 'object') {
        const src = Array.isArray(raw.spotsByDay) ? raw.spotsByDay : Object.entries(raw.spotsByDay).reduce((a, [k, v]) => { a[Number(k)] = v; return a; }, []);
        for (let d = 0; d < 7; d += 1) out[d] = src[d] == null || src[d] === '' ? 0 : Number(src[d]);
    } else if (Array.isArray(raw?.days)) {
        const n = Number(raw.spotsPerDay ?? 1);
        for (const d of raw.days.map(Number)) if (Number.isInteger(d) && d >= 0 && d <= 6) out[d] = n;
    }
    return out;
};

// One spot's price breakdown.
const priceSpot = ({ gross, volumeDiscountPercent = 0, agencyCommissionPercent: ac = 0, vatPercent = getVatPercent() }) => {
    const g = round2(gross);
    const volumeDiscount = round2(g * volumeDiscountPercent / 100);
    const afterVolume = round2(g - volumeDiscount);
    const agencyCommission = round2(afterVolume * ac / 100);
    const net = round2(afterVolume - agencyCommission);
    const vat = round2(net * vatPercent / 100);
    return { gross: g, volumeDiscountPercent, volumeDiscount, agencyCommissionPercent: ac, agencyCommission, net, vatPercent, vat, total: round2(net + vat) };
};

const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);
const utcDate = (s) => new Date(`${s}T00:00:00.000Z`);
const isDateOnly = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utcDate(s).getTime());

// The days a line airs: the campaign period (or the line's own range inside
// it), from tomorrow, on the chosen weekdays (and only days the rate is sold).
const lineDates = ({ from, to, days, rateDays, today }) => {
    const out = [];
    const start = from > today ? from : today;
    const want = new Set(days);
    const sold = Array.isArray(rateDays) && rateDays.length ? new Set(rateDays) : null;
    for (let t = utcDate(start).getTime(); t <= utcDate(to).getTime(); t += DAY_MS) {
        const d = new Date(t);
        const wd = d.getUTCDay();
        if (want.has(wd) && (!sold || sold.has(wd))) out.push(d.toISOString().slice(0, 10));
    }
    return out;
};

// The Monday that starts a date's week (YYYY-MM-DD): weeks can be switched
// off for bursts and quiet weeks (flighting).
const weekOf = (dateOnly) => {
    const d = new Date(`${dateOnly}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};

const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return h * 60 + m; };

/**
 * Build (price and expand) a plan. Returns { lines, totals, errors }.
 *   campaign: { startDate, endDate }
 *   rawLines: [{ stationId, rateId, spotsByDay:{weekday: n}, startDate?, endDate?, creativeId? }]
 *   agreements: Map(stationId → the agency's volume discount agreement) or null
 *   stations: Map(stationId → Station doc)
 *   isAgency: agency commission applies
 *   rateFields(station, rate) → { time, duration, slot, spotSeconds }
 */
const buildPlan = ({ campaign, rawLines, stations, isAgency, rateFields, agreements = null, now = new Date() }) => {
    const errors = [];
    const lines = [];
    const vatPercent = getVatPercent();
    const ac = isAgency ? agencyCommissionPercent() : 0;
    const today = dateOnly(new Date(now.getTime() + DAY_MS)); // bookable from tomorrow
    const cStart = campaign.startDate ? dateOnly(campaign.startDate) : null;
    const cEnd = campaign.endDate ? dateOnly(campaign.endDate) : cStart;

    if (!cStart) return { lines, totals: null, errors: [{ line: null, message: 'Set the campaign start and end dates first' }] };
    if (cEnd < today) return { lines, totals: null, errors: [{ line: null, message: 'This campaign has ended. Change its dates to book more spots.' }] };
    if (!Array.isArray(rawLines) || rawLines.length === 0) return { lines, totals: null, errors: [{ line: null, message: 'Add at least one line to the plan' }] };
    if (rawLines.length > MAX_LINES) return { lines, totals: null, errors: [{ line: null, message: `A plan can have at most ${MAX_LINES} lines` }] };

    const slotLengths = new Map(); // station|programme → spot length used (one length per programme)

    rawLines.forEach((raw, index) => {
        const fail = (message) => errors.push({ line: index, message });
        const station = stations.get(String(raw?.stationId));
        if (!station || station.approvalStatus !== 'APPROVED' || station.isActive === false) return fail('That media house is not available');
        const rate = (station.rateCard || []).find((r) => r && r.isActive !== false && String(r._id) === String(raw.rateId));
        if (!rate || !(Number(rate.price) > 0)) return fail(`That rate is not on ${station.name}'s rate card`);

        const spotsByDay = readSpotsByDay(raw);
        if (spotsByDay.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_SPOTS_PER_DAY)) return fail(`Spots on a day must be 0 to ${MAX_SPOTS_PER_DAY}`);
        const days = spotsByDay.map((n, d) => (n > 0 ? d : -1)).filter((d) => d >= 0);
        if (!days.length) return fail('Choose how many spots on at least one day');

        let from = cStart, to = cEnd;
        if (raw.startDate || raw.endDate) {
            if ((raw.startDate && !isDateOnly(raw.startDate)) || (raw.endDate && !isDateOnly(raw.endDate))) return fail('Dates must be YYYY-MM-DD');
            from = raw.startDate || cStart;
            to = raw.endDate || cEnd;
            if (from < cStart || to > cEnd || from > to) return fail('The line dates must be inside the campaign period');
        }

        const key = `${station._id}|${programmeKey(rate)}`;
        const length = rate.spotSeconds || 0;
        if (slotLengths.has(key) && slotLengths.get(key) !== length) return fail(`One spot length per programme: ${rate.name} is already in the plan at another length`);
        slotLengths.set(key, length);

        const fields = rateFields(station, rate);
        // Weeks switched off for this line (bursts and quiet weeks).
        const offWeeks = new Set((Array.isArray(raw.offWeeks) ? raw.offWeeks : []).filter((w) => isDateOnly(w)));
        const candidates = lineDates({ from, to, days, rateDays: rate.days, today }).filter((d) => !offWeeks.has(weekOf(d)));
        const dates = [];
        const skipped = [];
        for (const d of candidates) {
            const start = minutesOf(fields.time);
            const problem = checkStationCalendar(station, d, start, start + Number(fields.duration || 0));
            if (problem) skipped.push({ date: d, reason: problem }); else dates.push(d);
        }
        if (!dates.length) return fail(`No ${rate.name} dates are available in that period`);

        const agreement = agreements ? agreements.get(String(station._id)) : null;
        const unit = priceSpot({ gross: Number(rate.price), volumeDiscountPercent: volumeDiscountFor(agreement && agreement.status === 'APPROVED' ? agreement : null, rate), agencyCommissionPercent: ac, vatPercent });
        // Each date gets that weekday's number of spots.
        const spotsOn = dates.map((d) => spotsByDay[new Date(`${d}T00:00:00Z`).getUTCDay()]);
        const spots = spotsOn.reduce((t, n) => t + n, 0);
        lines.push({
            index,
            station: { _id: station._id, name: station.name, type: station.type, currency: station.pricing?.currency || 'NGN' },
            rate: { _id: rate._id, name: rate.name, kind: rate.kind, startTime: rate.startTime || null, endTime: rate.endTime || null, spotSeconds: rate.spotSeconds || null, days: rate.days || [] },
            fields,
            days,
            spotsByDay,
            spotsOn,
            offWeeks: [...offWeeks].sort(),
            // The agency's volume discount with this media house: APPROVED (used),
            // PENDING (waiting for the media house), REJECTED, or none.
            volumeDiscountStatus: agreement ? agreement.status : null,
            from,
            to,
            dates,
            skipped,
            spots,
            unit,
            totals: {
                gross: round2(unit.gross * spots),
                volumeDiscount: round2(unit.volumeDiscount * spots),
                agencyCommission: round2(unit.agencyCommission * spots),
                net: round2(unit.net * spots),
                vat: round2(unit.vat * spots),
                total: round2(unit.total * spots),
            },
            creativeId: raw.creativeId || null,
        });
    });

    const sum = (k) => round2(lines.reduce((t, l) => t + l.totals[k], 0));
    const totals = lines.length ? {
        spots: lines.reduce((t, l) => t + l.spots, 0),
        stations: new Set(lines.map((l) => String(l.station._id))).size,
        gross: sum('gross'),
        volumeDiscount: sum('volumeDiscount'),
        agencyCommission: sum('agencyCommission'),
        net: sum('net'),
        vat: sum('vat'),
        total: sum('total'),
        savings: round2(sum('volumeDiscount') + sum('agencyCommission')),
        vatPercent,
        agencyCommissionPercent: ac,
        currencies: [...new Set(lines.map((l) => l.station.currency))],
        firstDate: lines.map((l) => l.dates[0]).sort()[0],
        lastDate: lines.map((l) => l.dates[l.dates.length - 1]).sort().slice(-1)[0],
    } : null;
    if (totals && totals.spots > MAX_PLAN_SPOTS) errors.push({ line: null, message: `A plan can have at most ${MAX_PLAN_SPOTS.toLocaleString()} spots (this one has ${totals.spots.toLocaleString()}). Split it into two plans.` });
    if (totals && totals.currencies.length > 1) errors.push({ line: null, message: 'All media houses in one plan must use the same currency' });
    return { lines, totals, errors };
};

module.exports = {
    MAX_PLAN_SPOTS,
    agencyCommissionPercent,
    programmeKey,
    volumeDiscountFor,
    readSpotsByDay,
    weekOf,
    priceSpot,
    lineDates,
    buildPlan,
};
