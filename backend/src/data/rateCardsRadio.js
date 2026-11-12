// ─────────────────────────────────────────────────────────────
// RADIO RATE CARDS (₦ per spot, before VAT) — from the stations' own PDFs:
//   • Real FM 99.3 Abuja rate card
//   • Cool FM / Wazobia FM / Nigeria Info FM / Arewa Radio "Advert Rates"
//     (Cool Wazobia Info Africa, January 2024)
//   • Inspiration FM (IFM) 92.3 Lagos rate card
//
// Each belt is sold in 15/30/45/60-second spots (Inspiration also 5 s).
// Not modelled (agreed with the station): sponsorships, hypes, announcements,
// news mentions/coverage, outdoor broadcasts, jingle production, surcharges.
// ─────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

// prices in the cards' order: [15s, 30s, 45s, 60s] (Inspiration adds 5s first).
const belt = (name, code, startTime, endTime, [p15, p30, p45, p60], days = []) =>
    [[15, p15], [30, p30], [45, p45], [60, p60]]
        .filter(([, price]) => price)
        .map(([spotSeconds, price]) => ({ name, kind: 'TIME_BELT', code, startTime, endTime, spotSeconds, price, days, isActive: true }));

const CWIA_NOTES = 'Rates exclude 7.5% VAT. Materials must reach the station 24 hours before broadcast. Alcoholic brands air from 8pm at 4pm–10pm rates. Surcharges (100%): political, news, religious content, programme/ad displacement, fixed range of an hour or more.';

// Four belts, Monday–Sunday, as on the Cool Wazobia Info cards.
const cwia = ({ slug, name, city, state, frequency, shows, prices }) => ({
    slug,
    name,
    type: 'RADIO',
    location: { city, state, country: 'Nigeria' },
    website: 'https://www.coolwazobiainfo.com',
    email: 'clientservice@coolwazobiainfo.com',
    reach: `${frequency} · ${city}`,
    description: `${name}. ${CWIA_NOTES}`,
    rateCard: [
        ...belt(shows[0], 'MORNING', '05:00', '12:00', prices[0]),
        ...belt(shows[1], 'MIDDAY', '12:00', '16:00', prices[1]),
        ...belt(shows[2], 'EVENING', '16:00', '22:00', prices[2]),
        ...belt(shows[3], 'NIGHT', '22:00', '05:00', prices[3]),
    ],
});

const COOL = ['The Morning Drive (5am–12pm)', 'The Mid-Day Drive (12pm–4pm)', 'The Road Show (4pm–10pm)', 'The Night Show (10pm–5am)'];
const WAZOBIA = ['Make Una Wake Up (5am–12pm)', 'Aftanun Gbedu (12pm–4pm)', 'Evening Oyoyo (4pm–10pm)', 'Night Jolly (10pm–5am)'];
const NIGERIA_INFO = ['The Breakfast Show (5am–12pm)', 'The Brunch Buzz (12pm–4pm)', 'The Hard Facts (4pm–10pm)', 'Game On (10pm–5am)'];
const AREWA = ['Barka Da Safiya (5am–12pm)', 'Barka Da Rana (12pm–4pm)', 'Jakar Magori (4pm–10pm)', 'Zangon Dare (10pm–5am)'];

const RADIO_RATE_CARD_STATIONS = [
    {
        slug: 'real-fm-abuja',
        name: 'Real FM 99.3 Abuja',
        type: 'RADIO',
        location: { city: 'Abuja', state: 'FCT (Abuja)', country: 'Nigeria' },
        reach: '99.3 FM · Abuja',
        description: 'Real FM 99.3 Abuja ("…we the people"). Weekday and weekend belts. Guest appearances attract a 50% premium. Announcements, hypes, news mentions and outdoor broadcasts are booked with the station.',
        rateCard: [
            ...belt('Weekday morning (5am–11am)', 'WD-AM', '05:00', '11:00', [10125, 12656, 15820, 19775], WEEKDAYS),
            ...belt('Weekday daytime (11am–4pm)', 'WD-DAY', '11:00', '16:00', [8100, 10125, 12656, 15820], WEEKDAYS),
            ...belt('Weekday evening (4pm–11pm)', 'WD-PM', '16:00', '23:00', [10125, 12656, 15820, 19775], WEEKDAYS),
            ...belt('Weekend day (5am–4pm)', 'WE-DAY', '05:00', '16:00', [8100, 10125, 12656, 15820], WEEKENDS),
            ...belt('Weekend evening (4pm–11pm)', 'WE-PM', '16:00', '23:00', [5400, 6750, 8100, 10125], WEEKENDS),
            ...belt('Weekend night (11pm–5am)', 'WE-NIGHT', '23:00', '05:00', [8100, 10125, 12656, 15820], WEEKENDS),
        ],
    },
    {
        slug: 'inspiration-fm-lagos',
        name: 'Inspiration FM 92.3 Lagos',
        type: 'RADIO',
        location: { address: 'Penthouse Suite, Amazing Grace Plaza, 2E-4E Ligali Ayorinde Street, Victoria Island', city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
        website: 'https://www.ifm923.com',
        email: 'info@ifm923.com',
        phone: '012770926',
        reach: 'Lagos, Epe, Abeokuta, Badagry, Shagamu and Ijebu-Ode, plus online (about 33 million people)',
        description: 'Inspiration FM 92.3. Rates exclude VAT; materials (MP3) at least 24 hours before broadcast. Surcharges: political, news, programme displacement, fixed time, mid-news 100%; intra-programme 50%; premium content sponsorship 75%. Volume discounts 2–10%; ARCON/APCON-registered agencies 15% commission.',
        rateCard: [
            ...[['Premium (5am–12noon)', 'PREMIUM', '05:00', '12:00'], ['Premium (4pm–10pm)', 'PREMIUM', '16:00', '22:00']].flatMap(([n, c, s, e]) =>
                [[5, 6500], [15, 8400], [30, 13750], [45, 16200], [60, 21700]].map(([spotSeconds, price]) => ({ name: n, kind: 'TIME_BELT', code: c, startTime: s, endTime: e, spotSeconds, price, days: [], isActive: true }))),
            ...[['Regular (12noon–4pm)', 'REGULAR', '12:00', '16:00'], ['Regular (10pm–5am)', 'REGULAR', '22:00', '05:00']].flatMap(([n, c, s, e]) =>
                [[5, 4800], [15, 5000], [30, 8000], [45, 12000], [60, 16000]].map(([spotSeconds, price]) => ({ name: n, kind: 'TIME_BELT', code: c, startTime: s, endTime: e, spotSeconds, price, days: [], isActive: true }))),
        ],
    },

    // ── Cool FM ──
    cwia({ slug: 'cool-fm-lagos', name: 'Cool FM 96.9 Lagos', city: 'Lagos', state: 'Lagos', frequency: '96.9 FM', shows: COOL,
        prices: [[8313, 13125, 16250, 21750], [8000, 12188, 15313, 20500], [8313, 13125, 16250, 21750], [5813, 9063, 10313, 12500]] }),
    cwia({ slug: 'cool-fm-abuja', name: 'Cool FM 96.9 Abuja', city: 'Abuja', state: 'FCT (Abuja)', frequency: '96.9 FM', shows: COOL,
        prices: [[4563, 7063, 8750, 11750], [3938, 6125, 7688, 10188], [4563, 7063, 8750, 11750], [3750, 5813, 7375, 9688]] }),
    cwia({ slug: 'cool-fm-ph', name: 'Cool FM 95.9 Port Harcourt', city: 'Port Harcourt', state: 'Rivers', frequency: '95.9 FM', shows: COOL,
        prices: [[4688, 7375, 9250, 11750], [4063, 6438, 8000, 10625], [4688, 7375, 9250, 11750], [3750, 5938, 7500, 9688]] }),
    cwia({ slug: 'cool-fm-kano', name: 'Cool FM 96.9 Kano', city: 'Kano', state: 'Kano', frequency: '96.9 FM', shows: COOL,
        prices: [[2875, 4500, 5625, 7500], [2500, 4000, 5000, 6625], [2875, 4500, 5625, 7500], [2375, 3750, 4750, 6250]] }),

    // ── Wazobia FM ──
    cwia({ slug: 'wazobia-fm-lagos', name: 'Wazobia FM 95.1 Lagos', city: 'Lagos', state: 'Lagos', frequency: '95.1 FM', shows: WAZOBIA,
        prices: [[10625, 16875, 21125, 28125], [9625, 14875, 19375, 24875], [10625, 16875, 21125, 28125], [7375, 11875, 14688, 19625]] }),
    cwia({ slug: 'wazobia-fm-abuja', name: 'Wazobia FM 99.5 Abuja', city: 'Abuja', state: 'FCT (Abuja)', frequency: '99.5 FM', shows: WAZOBIA,
        prices: [[5438, 8700, 10730, 14500], [4930, 7830, 9643, 12905], [5438, 8700, 10730, 14500], [3988, 6380, 7975, 10730]] }),
    cwia({ slug: 'wazobia-fm-ph', name: 'Wazobia FM 94.1 Port Harcourt', city: 'Port Harcourt', state: 'Rivers', frequency: '94.1 FM', shows: WAZOBIA,
        prices: [[6000, 9375, 11850, 15750], [5475, 8475, 10500, 14100], [6000, 9375, 11850, 15750], [4350, 6975, 8625, 11625]] }),
    cwia({ slug: 'wazobia-fm-kano', name: 'Wazobia FM 95.1 Kano', city: 'Kano', state: 'Kano', frequency: '95.1 FM', shows: WAZOBIA,
        prices: [[3250, 5200, 6500, 8580], [2860, 4550, 5750, 7540], [3250, 5200, 6500, 8580], [2600, 3640, 4680, 6110]] }),
    cwia({ slug: 'wazobia-fm-onitsha', name: 'Wazobia FM 93.7 Onitsha', city: 'Onitsha', state: 'Anambra', frequency: '93.7 FM', shows: WAZOBIA,
        prices: [[3900, 6110, 7670, 9750], [3380, 5330, 6630, 8190], [3900, 6110, 7670, 9750], [3120, 4940, 6240, 7670]] }),

    // ── Nigeria Info FM ──
    cwia({ slug: 'nigeria-info-lagos', name: 'Nigeria Info 99.3 Lagos', city: 'Lagos', state: 'Lagos', frequency: '99.3 FM', shows: NIGERIA_INFO,
        prices: [[9680, 14850, 18480, 24530], [7480, 11550, 14630, 19030], [9680, 14850, 18480, 24530], [6600, 9240, 13640, 17600]] }),
    cwia({ slug: 'nigeria-info-abuja', name: 'Nigeria Info 95.1 Abuja', city: 'Abuja', state: 'FCT (Abuja)', frequency: '95.1 FM', shows: NIGERIA_INFO,
        prices: [[5033, 7778, 9882, 13085], [4575, 7137, 8967, 11438], [5033, 7778, 9882, 13085], [4392, 6863, 8693, 10980]] }),
    cwia({ slug: 'nigeria-info-ph', name: 'Nigeria Info 92.3 Port Harcourt', city: 'Port Harcourt', state: 'Rivers', frequency: '92.3 FM', shows: NIGERIA_INFO,
        prices: [[5625, 8850, 11100, 14100], [4875, 7725, 9600, 12750], [5625, 8850, 11100, 14100], [4500, 7125, 9000, 12000]] }),

    // ── Arewa Radio ──
    cwia({ slug: 'arewa-radio-kano', name: 'Arewa Radio 93.1 Kano', city: 'Kano', state: 'Kano', frequency: '93.1 FM', shows: AREWA,
        prices: [[3740, 6290, 7650, 9350], [3060, 4420, 5950, 8500], [3740, 6290, 7650, 9350], [2720, 3570, 4930, 6630]] }),
];

module.exports = { RADIO_RATE_CARD_STATIONS };
