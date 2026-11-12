// ─────────────────────────────────────────────────────────────
// REAL BROADCAST RATE CARDS (₦ per spot, before VAT)
//
// Typed from the stations' own rate card PDFs supplied to Media Masters:
//   • NTA National Rate (Group A: Lagos, Abuja, Port Harcourt), page 7
//   • Channels Television 2026 Rate Card
//   • TVC Communications Television Rate Card (TVC & TVC News)
//
// Each belt or programme is sold in spot lengths of 60/45/30/15 seconds.
// TIME_BELT rates carry their window; PLACEMENT rates are spots inside a
// named programme, which the station places on the booked day.
// Not modelled here (handled with the station directly): sponsorships,
// documentaries, live coverage, guest appearances, surcharges (political,
// fixed position) and minimum-slot rules; see each station's notes.
// ─────────────────────────────────────────────────────────────

const LENGTHS = [60, 45, 30, 15];

// One belt/programme → four rate-card rows (one per spot length).
const sizes = (base, prices) => prices
    .map((price, i) => (price ? { ...base, spotSeconds: LENGTHS[i], price, isActive: true } : null))
    .filter(Boolean);

const belt = (name, code, startTime, endTime, prices) =>
    sizes({ name, kind: 'TIME_BELT', code, startTime, endTime }, prices);

const programme = (name, code, prices) =>
    sizes({ name, kind: 'PLACEMENT', code }, prices);

const NTA_GROUP_A = {
    slug: 'nta-group-a',
    // Earlier names this station may already exist under (updated, not duplicated).
    aliases: ['nta', 'nta-lagos', 'nta-channel-5', 'nta-2-channel-5'],
    name: 'NTA (Group A: Lagos, Abuja, Port Harcourt)',
    type: 'TV',
    location: { city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
    website: 'https://www.nta.ng',
    reach: 'NTA 2 Channel 5 Lagos, NTA Channel 10 Lagos, NTA Channel 5 Abuja, NTA Port Harcourt',
    description: 'Nigerian Television Authority, Group A stations (Lagos, Abuja and Port Harcourt). Scroll messages, sponsorship, documentaries and programme participation are booked directly with NTA.',
    rateCard: [
        ...belt('A belt (9am–4pm)', 'A', '09:00', '16:00', [25000, 20000, 18000, 10000]),
        ...belt('AA belt (4pm–7pm)', 'AA', '16:00', '19:00', [40000, 35000, 30000, 20000]),
        ...belt('AAA belt (7pm–11pm)', 'AAA', '19:00', '23:00', [45000, 40000, 35000, 25000]),
        ...belt('Late night A belt (11pm–6am)', 'A', '23:00', '06:00', [25000, 20000, 18000, 10000]),
        ...programme('Within 7pm / Midnight News', 'NEWS', [90000, 80000, 70000, 50000]),
    ],
};

const CHANNELS = {
    slug: 'channels-television',
    aliases: ['channels', 'channels-tv'],
    name: 'Channels Television',
    type: 'TV',
    location: { address: '44/48 Channels TV Avenue, Isheri North, off Lagos–Ibadan Expressway', city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
    website: 'https://www.channelstv.com',
    email: 'sales.marketing@channelstv.com',
    phone: '08034774833',
    reach: 'Nationwide: DStv and all platforms',
    description: 'Channels Television. "All platforms" spots run everywhere Channels is carried; "DStv only" spots run on DStv. The News at 10pm needs at least 15 slots and other belts 5 (agreed with the station). Government/political bookings attract a 50% surcharge; fixed-time spots 50%; first in the mid-news break 100%.',
    rateCard: [
        ...belt('Day belt (6am–4pm) · All platforms', 'DAY', '06:00', '16:00', [135159.30, 124309.60, 85219.89, 61621.56]),
        ...belt('Day belt (6am–4pm) · DStv only', 'DAY', '06:00', '16:00', [114885.46, 105663.17, 72437.49, 52378.33]),
        ...belt('Evening belt (5pm–9pm) · All platforms', 'PRIME', '17:00', '21:00', [220759.50, 182759.50, 146051.10, 96841.55]),
        ...belt('Evening belt (5pm–9pm) · DStv only', 'PRIME', '17:00', '21:00', [187065.45, 155097.53, 124143.45, 82315.33]),
        ...belt('Sunrise / Business Morning (9am–11am) · All platforms', 'MORNING', '09:00', '11:00', [377945.56, 350949.46, 269961.12, 188972.78]),
        ...belt('Sunrise / Business Morning (9am–11am) · DStv only', 'MORNING', '09:00', '11:00', [328648.32, 305173.44, 234748.80, 164324.16]),
        ...belt('Within Politics Today (7pm) · All platforms', 'POLITICS', '19:00', '20:00', [510226.52, 473781.78, 364447.52, 255113.27]),
        ...belt('Within Politics Today (7pm) · DStv only', 'POLITICS', '19:00', '20:00', [443675.24, 411984.15, 316910.88, 221837.63]),
        ...belt('Within 8pm News · All platforms', 'NEWS', '20:00', '21:00', [481880.61, 447460.56, 344200.43, 240940.32]),
        ...belt('Within 8pm News · DStv only', 'NEWS', '20:00', '21:00', [419026.61, 389096.14, 300324.72, 209513.33]),
        ...programme('Within Mid News / Newstrack / 12–2pm News · All platforms', 'NEWS', [224478.54, 186119.91, 148972.13, 98778.44]),
        ...programme('Within Mid News / Newstrack / 12–2pm News · DStv only', 'NEWS', [190806.76, 158201.94, 126626.32, 83961.68]),
        ...programme('News adjacency before 10pm News · All platforms', 'ADJACENCY', [448956.36, 372234.06, 297944.28, 198556.78]),
        ...belt('Within The News at 10pm · All platforms', 'NEWS10', '22:00', '23:00', [961296.34, 892632.32, 563397.12, 394378.00]),
    ],
};

const TVC = {
    slug: 'tvc-communications',
    aliases: ['tvc', 'tvc-news', 'tvc-e'],
    name: 'TVC & TVC News',
    type: 'TV',
    location: { city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
    website: 'https://www.tvcnews.tv',
    email: 'commercial@tvccommunications.tv',
    reach: 'Any spot runs on both TVC (entertainment) and TVC News: DStv, GOtv, StarTimes, Sky, UHF and streaming',
    description: 'TVC Communications. Every spot runs on both TVC and TVC News. Advert materials must be ARCON certified and received at least 24 hours before broadcast; alcoholic beverages air from 10pm. Surcharges: political 100%, fixed time 100%, intra-programme 100%, programme/news adjacency 60%, spot displacement 50%.',
    rateCard: [
        ...belt('Run of spot (5am–4pm)', 'ROS', '05:00', '16:00', [100000, 80000, 60000, 35000]),
        ...belt('Run of spot (4pm–7pm)', 'ROS', '16:00', '19:00', [120000, 100000, 70000, 40000]),
        ...belt('Run of spot (7pm–12am)', 'ROS', '19:00', '00:00', [150000, 120000, 80000, 50000]),
        ...belt('Within 12pm News', 'NEWS', '12:00', '13:00', [180000, 120000, 80000, 52500]),
        ...belt('Within 4pm News', 'NEWS', '16:00', '17:00', [250000, 180000, 120000, 80000]),
        ...belt('Within 7pm News', 'NEWS', '19:00', '20:00', [400000, 300000, 250000, 150000]),
        ...belt('Within 10pm News', 'NEWS', '22:00', '23:00', [665512.85, 617976.22, 400000, 250000]),
        ...programme('Within Wake Up Nigeria / This Morning', 'PROG', [300000, 250000, 150000, 100000]),
        ...programme('Within Your View', 'PROG', [375000, 312500, 187500, 125000]),
        ...programme('Within e-Splash', 'PROG', [300000, 250000, 150000, 100000]),
        ...programme("Within Journalists' Hangout", 'PROG', [459203.87, 426403.60, 328002.77, 229601.94]),
        ...programme('Within Beyond the Headlines', 'PROG', [300000, 200000, 150000, 100000]),
        ...programme('Within Business Nigeria', 'PROG', [300000, 250000, 200000, 100000]),
    ],
};

module.exports = { RATE_CARD_STATIONS: [NTA_GROUP_A, CHANNELS, TVC] };
