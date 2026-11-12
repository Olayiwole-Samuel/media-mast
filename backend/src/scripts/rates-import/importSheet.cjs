// One-off: turns the dumped "MEDIA RATES NIGERIA - 2024 WIP.xlsx" rows into rate-card stations.
// Usage: node import-sheet.cjs rates.txt out.js report.txt
const fs = require('fs');
const [, , input, outFile, reportFile] = process.argv;
const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/);
const report = [];

const REGIONS = {
    'NATIONAL TV': null, 'PSEUDO NETWORKS': 'SKIP', 'LAGOS/WEST': 'Lagos', 'LAGOS': 'Lagos', 'IBADAN': 'Oyo', 'EDO': 'Edo', 'EDO ': 'Edo',
    'ANAMBRA': 'Anambra', 'ANAMBRA ': 'Anambra', 'ABIA': 'Abia', 'ABIA ': 'Abia', 'NORTH/FCT': null, 'FCT - ABUJA': 'FCT (Abuja)', 'FCT': 'FCT (Abuja)',
    'KADUNA': 'Kaduna', 'KATSINA': 'Katsina', 'KATSINA ': 'Katsina', 'KANO': 'Kano', 'PLATEAU': 'Plateau', 'NATIONAL': null, 'EAST/SOUTH': null,
    'P/HARCOURT': 'Rivers', 'ENUGU': 'Enugu', 'ABA': 'Abia', 'LOKOJA': 'Kogi', 'JOS': 'Plateau', 'MAGAZINES': null,
};
const CITY = { 'Akwa Ibom': 'Uyo', Lagos: 'Lagos', Oyo: 'Ibadan', Edo: 'Benin City', Anambra: 'Awka', Abia: 'Aba', 'FCT (Abuja)': 'Abuja', Kaduna: 'Kaduna', Katsina: 'Katsina', Kano: 'Kano', Plateau: 'Jos', Rivers: 'Port Harcourt', Enugu: 'Enugu', Kogi: 'Lokoja' };
// Covered by the stations' own newer PDFs (data/rateCards.js, data/rateCardsRadio.js).
const SKIP_STATIONS = new Set(['CHANNELS', 'COOL FM LAGOS', 'WAZOBIA FM', 'COOL FM ABUJA']);
// Syndicated programmes, not stations.
const SKIP_PROGRAMMES = new Set(['KANDAVAL SPORTS', 'SPORTSVILLE', 'DEAR MOTHER', 'VIDEO FASHION', 'AFRICAN KITCHEN', 'COOL TEENS', 'CHAT STREET', 'GOOD LIFE']);

const title = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(Nta|Ait|Tv|Fm|Ktv|Ctv|Bcos|Akbc|Bca|Abs|Ksmc|Mtv)\b/g, (w) => w.toUpperCase())
    .replace(/(\d)fm\b/gi, '$1 FM').replace(/\bThisday\b/, 'ThisDay').replace(/\bBusinessday\b/, 'BusinessDay')
    .replace(/\bAaaa\b|\bAaa\b|\bAa\b|\bEe\b|\bXx\b/g, (w) => w.toUpperCase()).replace(/\bM\/N\b/i, 'Mid News');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const round2 = (n) => Math.round(n * 100) / 100;

// ── Days ──
const DAY = { SUN: 0, MON: 1, M: 1, TUE: 2, TUES: 2, WED: 3, THU: 4, THUR: 4, THURS: 4, TH: 4, FRI: 5, F: 5, SAT: 6 };
const parseDays = (raw) => {
    const s = raw.toUpperCase().replace(/MORNING BELT/g, '');
    if (/MON\s*-\s*SUN/.test(s)) return [];
    const range = s.match(/\b(MON|M|TUE|WED|THU|THUR|FRI|SAT|SUN)\b[\s.,]*-[\s,]*\b(MON|TUE|WED|THU|THUR|TH|FRI|F|SAT|SUN)\b\.?/);
    if (range) {
        const a = DAY[range[1]], b = DAY[range[2]];
        const out = [];
        for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
        return out;
    }
    const words = [...s.matchAll(/\b(MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT|SUN)\b/g)].map((m) => DAY[m[1]]);
    return [...new Set(words)];
};

// ── Times ──
const T = /(12\s*NOON|NOON|12\s*MIDNIGHT|MIDNIGHT|CLOSE\s*DOWN|CLOSEDOWN|\d{1,2}(?:[.:]\d{2})?\s*(?:AM|PM|A\b)?)/gi;
const toHHMM = (tok, fallbackMer) => {
    const t = tok.toUpperCase().replace(/\s+/g, '');
    if (/NOON/.test(t)) return { hhmm: '12:00', mer: 'PM' };
    if (/MIDNIGHT/.test(t)) return { hhmm: '00:00', mer: 'AM' };
    if (/CLOSE/.test(t)) return { hhmm: '00:00', mer: 'AM' };
    const m = t.match(/^(\d{1,2})(?:[.:](\d{2}))?(AM|PM|A)?$/);
    if (!m) return null;
    let h = Number(m[1]); const min = Number(m[2] || 0);
    let mer = m[3] === 'A' ? 'AM' : m[3] || fallbackMer || null;
    if (!mer || h > 12 || min > 59) return null;
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return { hhmm: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, mer };
};
// "6AM - 12 NOON & 4PM - 10PM" → [{start,end}...]; single times → {single}
const parseTimes = (raw) => {
    const s = raw.toUpperCase().replace(/(\d)\.\s*(AM|PM)/g, '$1$2').replace(/(\d)\s+(\d{2})\b/g, '$1.$2').replace(/12NOON/g, '12 NOON').replace(/12MIDNIGHT/g, '12 MIDNIGHT');
    const windows = [];
    const re = new RegExp(`${T.source}\\s*-\\s*${T.source}`, 'gi');
    let m;
    const used = [];
    while ((m = re.exec(s))) {
        const endTok = toHHMM(m[2]);
        const start = toHHMM(m[1], endTok?.mer);
        if (start && endTok && start.hhmm !== endTok.hhmm) windows.push({ start: start.hhmm, end: endTok.hhmm });
        used.push([m.index, m.index + m[0].length]);
    }
    if (windows.length) return { windows };
    const single = [...s.matchAll(T)].map((x) => toHHMM(x[1])).filter(Boolean);
    return single.length ? { single: single[0].hhmm } : {};
};
const hm = (hhmm) => { const [h, mi] = hhmm.split(':').map(Number); const mer = h >= 12 ? 'pm' : 'am'; const h12 = h % 12 || 12; return `${h12}${mi ? `.${String(mi).padStart(2, '0')}` : ''}${mer}`; };

const stations = [];
let current = null, state = null, sheet = null, skipping = false, lengths = null;

const flush = () => { if (current && current.rateCard.length) stations.push(current); current = null; };

for (const line of lines) {
    if (!line.trim()) continue;
    const sheetMatch = line.match(/^===== (\w+)/);
    if (sheetMatch) { flush(); sheet = sheetMatch[1]; state = null; skipping = false; continue; }
    const cells = Object.fromEntries(line.split(' | ').map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
    if (sheet === 'PRESS') continue; // handled below

    // Column header rows tell which column is which length.
    if (Object.values(cells).some((v) => /SECS/.test(v))) {
        lengths = {};
        for (const [col, v] of Object.entries(cells)) { const n = v.match(/(\d+)\s*SECS/); if (n) lengths[col] = Number(n[1]); }
        if (cells.A && REGIONS[cells.A.trim()] !== undefined) { flush(); state = REGIONS[cells.A.trim()]; skipping = false; }
        continue;
    }
    const name = (cells.A || '').trim();
    const priceCols = Object.keys(lengths || {}).filter((c) => cells[c] != null);
    if (!priceCols.length && name && !cells.B) {
        if (REGIONS[name] !== undefined || REGIONS[cells.A] !== undefined) {
            flush();
            const r = REGIONS[name] ?? REGIONS[cells.A];
            if (r === 'SKIP') { skipping = true; } else { skipping = false; state = r; }
            continue;
        }
        if (/^TOTAL/.test(name)) { flush(); continue; }
        // Sub-headings inside a station (e.g. NTA Network's mid-news blocks).
        if (current && !current.skip && /^MIDNEWS/.test(name)) continue;
        if (skipping || SKIP_PROGRAMMES.has(name)) { flush(); report.push(`skipped (syndicated programme, not a station): ${name}`); current = null; continue; }
        if (SKIP_STATIONS.has(name)) { flush(); report.push(`skipped (newer PDF loaded instead): ${name}`); current = { skip: true, rateCard: [] }; continue; }
        flush();
        // A few stations sit under the wrong region in the sheet.
        const fixedState = /RIVERS|P\/H/.test(name) ? 'Rivers' : /UYO/.test(name) ? 'Akwa Ibom' : /UMUAHIA/.test(name) ? 'Abia' : state;
        current = { name: title(name), type: sheet === 'TV' ? 'TV' : 'RADIO', state: fixedState, rateCard: [] };
        continue;
    }
    if (!current || current.skip || skipping) continue;
    if (!name) continue;
    if (/^SYNDICATED/.test(name)) continue;

    // Prices for this row.
    let prices = priceCols.map((c) => ({ len: lengths[c], v: Number(cells[c]) })).filter((p) => Number.isFinite(p.v));
    if (prices.length && prices.every((p) => p.v <= 1)) { report.push(`skipped surcharge row (percentage): ${current.name} · ${name}`); continue; }
    prices = prices.filter((p) => p.v > 1);
    if (!prices.length) { report.push(`skipped (no prices): ${current.name} · ${name}`); continue; }
    // Columns typed in reverse (60s cheaper than 15s): swap them back and flag.
    const sorted = [...prices].sort((a, b) => a.len - b.len);
    if (sorted.length >= 3 && sorted.every((p, i) => i === 0 || p.v < sorted[i - 1].v)) {
        const vals = sorted.map((p) => p.v).reverse();
        sorted.forEach((p, i) => { p.v = vals[i]; });
        prices = sorted;
        report.push(`CHECK: prices went down as spots got longer; read them reversed: ${current.name} · ${name}`);
    }

    const whenText = `${cells.B || ''} ${/\d/.test(name) ? name : ''}`;
    const days = parseDays(cells.B || '');
    const { windows, single } = parseTimes(whenText);
    const base = title(name.replace(/\s+/g, ' '));
    // Skip rows the sheet repeats word for word.
    const add = (rate) => prices.forEach((p) => {
        const row = { ...rate, spotSeconds: p.len, price: round2(p.v), days, isActive: true };
        const dup = current.rateCard.find((r) => r.name === row.name && r.spotSeconds === row.spotSeconds && String(r.days) === String(row.days) && (r.startTime || '') === (row.startTime || ''));
        if (dup) { if (dup.price !== row.price) report.push(`CHECK: two different prices for the same rate, kept the first: ${current.name} · ${row.name} ${row.spotSeconds}s`); return; }
        current.rateCard.push(row);
    });
    if (windows && windows.length) {
        windows.forEach((w) => add({ name: `${base} (${hm(w.start)}–${hm(w.end)})`.slice(0, 80), kind: 'TIME_BELT', startTime: w.start, endTime: w.end }));
    } else {
        // Only add the time when the name doesn't already say it ("Mid News (10pm)").
        add({ name: `${base}${single && !/\d/.test(base) ? ` (${hm(single)})` : ''}`.slice(0, 80), kind: 'PLACEMENT' });
        if (cells.B && !single) report.push(`no time found, booked as an in-programme spot: ${current.name} · ${name} [${cells.B.trim()}]`);
    }
}
flush();

// ── PRESS sheet ──
{
    const pressLines = lines.slice(lines.findIndex((l) => l.startsWith('===== PRESS')) + 1);
    const colour = {};
    let headers = null;
    for (const line of pressLines) {
        if (!line.trim()) continue;
        const cells = Object.fromEntries(line.split(' | ').map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
        if (cells.B === 'COLOUR' && cells.AW) continue;
        if (cells.A === 'NATIONAL DAILIES') { headers = cells; continue; }
        if (!headers || !cells.A) continue;
        const paper = cells.A.trim();
        if (paper === 'MAGAZINES') continue;
        const card = [];
        const colIndex = (col) => col.split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);
        for (const [col, label] of Object.entries(headers)) {
            if (col === 'A' || !label.trim()) continue;
            const raw = cells[col];
            if (raw == null || raw === 'NIL') continue;
            const v = Number(raw);
            if (!Number.isFinite(v) || v <= 1) continue;
            if (v > 5000000) { report.push(`CHECK: skipped an unusually high press price (₦${v.toLocaleString()}): ${title(paper)} · ${label}`); continue; }
            const isColour = colIndex(col) < colIndex('AW');
            const size = title(label.replace(/\s+/g, ' ')).slice(0, 40);
            card.push({ name: `${size}${isColour ? '' : ' (B&W)'}`.slice(0, 80), kind: 'PLACEMENT', size, colour: isColour ? 'COLOUR' : 'BLACK_WHITE', price: round2(v), days: [], isActive: true });
        }
        if (card.length) stations.push({ name: title(paper), type: 'PRESS', state: null, rateCard: card });
        else report.push(`skipped (no prices yet): ${title(paper)}`);
    }
}

// Cosmo FM's super-prime row reads "M-F (5.30AM-11AM) & (3PM-10AM) SUN (3PM-10PM)":
// the weekday evening window is a typo for 3pm–10pm, and 3pm–10pm also runs on Sundays.
{
    const cosmo = stations.find((s) => s.name === 'Cosmo FM');
    if (cosmo) {
        cosmo.rateCard = cosmo.rateCard.filter((r) => !(r.name.startsWith('AAAA') && r.startTime === '15:00' && r.endTime === '22:00'));
        for (const r of cosmo.rateCard) {
            if (r.name.startsWith('AAAA') && r.startTime === '15:00' && r.endTime === '10:00') {
                r.endTime = '22:00';
                r.name = 'AAAA Super Prime (3pm–10pm)';
                cosmo.rateCard.push({ ...r, name: 'AAAA Super Prime Sunday (3pm–10pm)', days: [0] });
            }
            if (r.name === 'AAAA (5.30am–11am)') r.name = 'AAAA Super Prime (5.30am–11am)';
        }
        report.push('CHECK: Cosmo FM super-prime belt corrected (sheet says 3PM–10AM; read as 3pm–10pm Mon–Fri, plus Sundays 3pm–10pm)');
    }
}

// Final shape (slug, location, description); keep names unique.
const seen = new Set();
const out = stations.map((s) => {
    let slug = slugify(s.name);
    for (let n = 2; seen.has(slug); n++) slug = `${slugify(s.name)}-${n}`;
    seen.add(slug);
    return {
        slug,
        name: s.name,
        type: s.type,
        location: { city: s.state ? CITY[s.state] || null : null, state: s.state, country: 'Nigeria' },
        description: `${s.name}. Rates from "Media Rates Nigeria 2024" (work in progress); confirm with the station before large bookings. Surcharges (e.g. mid-news) are agreed with the station.`,
        source: 'MEDIA RATES NIGERIA - 2024 WIP.xlsx',
        rateCard: s.rateCard,
    };
});

fs.writeFileSync(outFile, `// Generated from "MEDIA RATES NIGERIA - 2024 WIP.xlsx" (TV, RADIO and PRESS sheets).
// ₦ per spot / insertion, before VAT. Regenerate with the importer; do not edit by hand.
module.exports = { SHEET_RATE_CARD_STATIONS: ${JSON.stringify(out, null, 1)} };
`);
fs.writeFileSync(reportFile, report.join('\n') + '\n');
console.log(`stations: ${out.length} (${out.filter((s) => s.type === 'TV').length} TV, ${out.filter((s) => s.type === 'RADIO').length} radio, ${out.filter((s) => s.type === 'PRESS').length} press), rates: ${out.reduce((t, s) => t + s.rateCard.length, 0)}, report lines: ${report.length}`);
