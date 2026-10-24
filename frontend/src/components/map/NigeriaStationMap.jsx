"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getStations } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Homepage hero: where advertisers can book, on a map of Nigeria.
//
// Real approved stations only (GET /api/v1/stations, public). Each state
// with stations gets a pin at its capital, sized by how many stations it
// has; hover or focus shows them, click opens the stations page. States
// without stations show as faint dots, so nothing is claimed that isn't
// on the platform. The outline is simplified (hand-traced border points).
// ─────────────────────────────────────────────────────────────

// Simplified border, [longitude, latitude], clockwise from the south-west coast.
const BORDER = [
    [2.69, 6.37], [2.72, 7.0], [2.75, 8.5], [3.1, 9.1], [3.6, 10.3], [3.6, 11.7], [4.1, 12.9],
    [4.9, 13.75], [6.4, 13.6], [7.8, 13.35], [9.0, 12.85], [10.0, 13.25], [11.3, 13.35],
    [12.4, 13.1], [13.3, 13.55], [14.1, 13.1], [14.6, 13.0], [14.5, 12.2], [14.2, 11.3],
    [13.8, 10.9], [13.3, 10.1], [12.9, 9.4], [12.5, 8.6], [11.9, 7.4], [11.4, 6.9], [10.9, 6.8],
    [10.6, 7.1], [9.8, 6.5], [9.4, 5.9], [8.9, 5.3], [8.6, 4.6], [8.0, 4.4], [7.0, 4.4],
    [6.1, 4.25], [5.4, 5.1], [4.8, 6.1], [3.9, 6.4],
];

// The 36 states and the FCT at their capitals: [name, capital, latitude, longitude].
const STATES = [
    ["Abia", "Umuahia", 5.53, 7.49], ["Adamawa", "Yola", 9.21, 12.48], ["Akwa Ibom", "Uyo", 5.04, 7.91],
    ["Anambra", "Awka", 6.21, 7.07], ["Bauchi", "Bauchi", 10.31, 9.84], ["Bayelsa", "Yenagoa", 4.92, 6.27],
    ["Benue", "Makurdi", 7.73, 8.54], ["Borno", "Maiduguri", 11.83, 13.15], ["Cross River", "Calabar", 4.95, 8.32],
    ["Delta", "Asaba", 6.2, 6.73], ["Ebonyi", "Abakaliki", 6.32, 8.11], ["Edo", "Benin City", 6.34, 5.63],
    ["Ekiti", "Ado-Ekiti", 7.62, 5.22], ["Enugu", "Enugu", 6.46, 7.55], ["FCT", "Abuja", 9.06, 7.49],
    ["Gombe", "Gombe", 10.29, 11.17], ["Imo", "Owerri", 5.48, 7.03], ["Jigawa", "Dutse", 11.76, 9.34],
    ["Kaduna", "Kaduna", 10.52, 7.44], ["Kano", "Kano", 12.0, 8.52], ["Katsina", "Katsina", 12.99, 7.6],
    ["Kebbi", "Birnin Kebbi", 12.45, 4.2], ["Kogi", "Lokoja", 7.8, 6.74], ["Kwara", "Ilorin", 8.5, 4.55],
    ["Lagos", "Ikeja", 6.6, 3.35], ["Nasarawa", "Lafia", 8.49, 8.52], ["Niger", "Minna", 9.61, 6.56],
    ["Ogun", "Abeokuta", 7.15, 3.35], ["Ondo", "Akure", 7.25, 5.19], ["Osun", "Osogbo", 7.77, 4.56],
    ["Oyo", "Ibadan", 7.38, 3.94], ["Plateau", "Jos", 9.9, 8.86], ["Rivers", "Port Harcourt", 4.82, 7.03],
    ["Sokoto", "Sokoto", 13.06, 5.24], ["Taraba", "Jalingo", 8.89, 11.36], ["Yobe", "Damaturu", 11.75, 11.96],
    ["Zamfara", "Gusau", 12.16, 6.66],
];

// Names people type for a state, a capital or a big city → the state.
const ALIASES = {
    abuja: "FCT", "federal capital territory": "FCT", fct: "FCT",
    "port harcourt": "Rivers", ph: "Rivers", ibadan: "Oyo", ikeja: "Lagos", "lagos island": "Lagos",
    "benin": "Edo", "benin city": "Edo", calabar: "Cross River", warri: "Delta", onitsha: "Anambra",
    aba: "Abia", zaria: "Kaduna", jos: "Plateau", ilorin: "Kwara", maiduguri: "Borno", yola: "Adamawa",
    uyo: "Akwa Ibom", owerri: "Imo", akure: "Ondo", abeokuta: "Ogun", osogbo: "Osun", minna: "Niger",
    makurdi: "Benue", lokoja: "Kogi", lafia: "Nasarawa", sokoto: "Sokoto", katsina: "Katsina",
};
const BY_NAME = Object.fromEntries(STATES.map((s) => [s[0].toLowerCase(), s[0]]));
for (const s of STATES) ALIASES[s[1].toLowerCase()] ??= s[0];

const stateOf = (location) => {
    for (const raw of [location?.state, location?.city]) {
        const key = String(raw || "").trim().toLowerCase().replace(/\s+state$/, "").replace(/-/g, " ");
        if (!key) continue;
        if (BY_NAME[key]) return BY_NAME[key];
        if (ALIASES[key]) return ALIASES[key];
    }
    return null;
};

// Equirectangular projection into the SVG box.
const VIEW_W = 600;
const VIEW_H = 520;
const LON = [2.0, 15.3];
const LAT = [3.6, 14.4];
const PAD = 32;
const scale = Math.min((VIEW_W - PAD * 2) / (LON[1] - LON[0]), (VIEW_H - PAD * 2) / (LAT[1] - LAT[0]));
const offX = (VIEW_W - (LON[1] - LON[0]) * scale) / 2;
const offY = (VIEW_H - (LAT[1] - LAT[0]) * scale) / 2;
const project = (lon, lat) => [offX + (lon - LON[0]) * scale, offY + (LAT[1] - lat) * scale];

const OUTLINE = `M${BORDER.map(([lon, lat]) => project(lon, lat).map((n) => n.toFixed(1)).join(" ")).join(" L")} Z`;

const UNIT = { SPOT: "spot", DAY: "day", WEEK: "week", MONTH: "month", CAMPAIGN: "campaign", IMPRESSION: "impression", CUSTOM: "booking" };
const TYPE_LABEL = { RADIO: "Radio", TV: "TV", PRESS: "Press", BILLBOARD: "Billboard", DIGITAL: "Digital" };

const money = (amount, currency) => {
    try {
        return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${currency || "NGN"} ${Math.round(amount).toLocaleString()}`;
    }
};

// Summary of one state's stations for its card.
const summarise = (stations) => {
    const types = [...new Set(stations.map((s) => TYPE_LABEL[s.type] || s.type).filter(Boolean))];
    const priced = stations.filter((s) => Number(s.pricing?.amount) > 0).sort((a, b) => a.pricing.amount - b.pricing.amount);
    const from = priced[0] ? `from ${money(priced[0].pricing.amount, priced[0].pricing.currency)} / ${UNIT[priced[0].pricing.unit] || "booking"}` : null;
    return { types, from };
};

export default function NigeriaStationMap() {
    const [stations, setStations] = useState(null); // null = loading
    const [active, setActive] = useState(null); // { name, x, y }: state under the pointer or focus, and where its pin is
    const rootRef = useRef(null);

    // Show a state's card next to its pin (on whichever side has room).
    const openCard = (name, el) => {
        const root = rootRef.current;
        if (!root || !el) return setActive({ name, x: 0, y: 0, side: "right" });
        const r = root.getBoundingClientRect();
        const p = el.getBoundingClientRect();
        const x = p.left + p.width / 2 - r.left;
        const y = p.top + p.height / 2 - r.top;
        return setActive({ name, x, y, side: x > r.width / 2 ? "left" : "right", below: y < 180 });
    };
    const [ripple, setRipple] = useState(null); // { name, n }: the state of the latest "on air" pulse

    useEffect(() => {
        let live = true;
        getStations()
            .then((res) => live && setStations(Array.isArray(res?.data) ? res.data : []))
            .catch(() => live && setStations([]));
        return () => { live = false; };
    }, []);

    // Stations grouped by state (stations whose state can't be placed are counted, not pinned).
    const { byState, unplaced } = useMemo(() => {
        const map = new Map();
        let other = 0;
        for (const s of stations || []) {
            const st = stateOf(s.location);
            if (!st) { other += 1; continue; }
            if (!map.has(st)) map.set(st, []);
            map.get(st).push(s);
        }
        return { byState: map, unplaced: other };
    }, [stations]);

    const activeStates = useMemo(() => [...byState.keys()], [byState]);

    // Every few seconds one station state "goes on air".
    useEffect(() => {
        if (!activeStates.length) return undefined;
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
        let i = 0;
        const id = setInterval(() => {
            setRipple({ name: activeStates[i % activeStates.length], n: i });
            i += 1;
        }, 2600);
        return () => clearInterval(id);
    }, [activeStates]);

    const total = stations ? stations.length : 0;
    const card = active ? { name: active.name, list: byState.get(active.name) || [] } : null;
    const cardInfo = card ? summarise(card.list) : null;

    const readout = stations === null
        ? "Loading stations…"
        : total
            ? `${total} station${total === 1 ? "" : "s"} across ${activeStates.length} state${activeStates.length === 1 ? "" : "s"}${unplaced ? ` (+${unplaced} unplaced)` : ""}`
            : "Stations are joining soon";

    const go = () => window.location.assign("/stations");

    return (
        <div ref={rootRef} className="relative h-full w-full bg-[#05070c]">
            <style>{`
                @keyframes mmPulse { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(3.2); opacity: 0 } }
                @keyframes mmRipple { 0% { transform: scale(1); opacity: .8 } 100% { transform: scale(7); opacity: 0 } }
                .mm-pulse { transform-box: fill-box; transform-origin: center; animation: mmPulse 2.6s ease-out infinite }
                .mm-ripple { transform-box: fill-box; transform-origin: center; animation: mmRipple 1.8s ease-out 1 forwards }
                @media (prefers-reduced-motion: reduce) { .mm-pulse, .mm-ripple { animation: none; opacity: 0 } }
            `}</style>

            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="absolute inset-0 h-full w-full"
                role="img"
                aria-label={`Map of Nigeria. ${readout}.`}
            >
                <defs>
                    <pattern id="mm-dots" width="12" height="12" patternUnits="userSpaceOnUse">
                        <circle cx="6" cy="6" r="1" fill="#34d399" opacity="0.18" />
                    </pattern>
                    <clipPath id="mm-clip"><path d={OUTLINE} /></clipPath>
                    <radialGradient id="mm-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Country: soft fill, dot texture, outline */}
                <path d={OUTLINE} fill="#0b1512" />
                <rect width={VIEW_W} height={VIEW_H} fill="url(#mm-dots)" clipPath="url(#mm-clip)" />
                <path d={OUTLINE} fill="none" stroke="#34d399" strokeOpacity="0.45" strokeWidth="1.5" strokeLinejoin="round" />

                {/* Every state capital: faint dot; states with stations: a pin */}
                {STATES.map(([name, capital, lat, lon]) => {
                    const [x, y] = project(lon, lat);
                    const list = byState.get(name);
                    if (!list) {
                        return <circle key={name} cx={x} cy={y} r="2.2" fill="#9fb6ae" opacity="0.35" />;
                    }
                    const r = Math.min(6 + Math.sqrt(list.length) * 3, 16);
                    const isActive = active?.name === name;
                    return (
                        <g
                            key={name}
                            role="button"
                            tabIndex={0}
                            aria-label={`${name}: ${list.length} station${list.length === 1 ? "" : "s"}. Open stations.`}
                            className="cursor-pointer outline-none"
                            onMouseEnter={(e) => openCard(name, e.currentTarget)}
                            onMouseLeave={() => setActive((a) => (a?.name === name ? null : a))}
                            onFocus={(e) => openCard(name, e.currentTarget)}
                            onBlur={() => setActive((a) => (a?.name === name ? null : a))}
                            onClick={go}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
                        >
                            {ripple?.name === name && (
                                <circle key={`r-${ripple.n}`} className="mm-ripple" cx={x} cy={y} r={r} fill="none" stroke="#e8a33d" strokeWidth="1.5" />
                            )}
                            <circle className="mm-pulse" cx={x} cy={y} r={r} fill="#34d399" opacity="0.5" />
                            <circle cx={x} cy={y} r={r * 2.2} fill="url(#mm-glow)" opacity={isActive ? 0.55 : 0.25} />
                            <circle cx={x} cy={y} r={r} fill={isActive ? "#6ee7b7" : "#34d399"} stroke="#05070c" strokeWidth="2" />
                            {list.length > 1 && (
                                <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#05231a" pointerEvents="none">
                                    {list.length}
                                </text>
                            )}
                            {/* Larger invisible hit area */}
                            <circle cx={x} cy={y} r={Math.max(r + 10, 18)} fill="transparent" />
                            <title>{`${name} (${capital})`}</title>
                        </g>
                    );
                })}
            </svg>

            {/* Hover / focus card, beside the pin */}
            <div
                className={`pointer-events-none absolute w-64 rounded-2xl border border-emerald-400/30 bg-black/70 p-4 backdrop-blur-md transition-opacity duration-200 ${card ? "opacity-100" : "opacity-0"}`}
                style={active ? {
                    left: active.side === "right" ? active.x + 22 : undefined,
                    right: active.side === "left" ? `calc(100% - ${active.x - 22}px)` : undefined,
                    top: active.below ? active.y - 12 : undefined,
                    bottom: active.below ? undefined : `calc(100% - ${active.y + 12}px)`,
                } : { right: 24, top: 24 }}
                aria-live="polite"
            >
                {card && (
                    <>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">{card.name}</p>
                        <p className="mt-1 text-base font-semibold text-white">
                            {card.list.length} station{card.list.length === 1 ? "" : "s"} taking bookings
                        </p>
                        <p className="mt-1 text-xs text-white/70">
                            {[cardInfo.types.join(", "), cardInfo.from].filter(Boolean).join(" · ")}
                        </p>
                        <ul className="mt-3 space-y-1 text-sm text-white/85">
                            {card.list.slice(0, 3).map((s) => (
                                <li key={s._id || s.slug} className="truncate">{s.name}</li>
                            ))}
                            {card.list.length > 3 && <li className="text-xs text-white/50">+{card.list.length - 3} more</li>}
                        </ul>
                        <p className="mt-3 text-xs font-medium text-emerald-300">Click to see stations →</p>
                    </>
                )}
            </div>

            {/* Readout */}
            <div className="pointer-events-none absolute bottom-6 left-6 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                    On air across Nigeria
                </p>
                <p className="font-mono text-xs tabular-nums text-white/70">{readout}</p>
            </div>
        </div>
    );
}
