"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Loader2, ShoppingCart, ShieldCheck, Search, Tv, Radio, Newspaper, Monitor, Image as BillboardIcon,
    ChevronDown, ChevronUp, CalendarDays, Check, AlertTriangle, MapPin,
} from "lucide-react";
import { getCampaigns, getStations, getCreatives, getStationAvailability } from "@/lib/api";
import { calendarProblem } from "@/lib/stationCalendar";
import { formatMoney } from "@/lib/status";
import { useSession } from "@/lib/auth";
import { useCart, advertiserPaths, MAX_CART_ITEMS } from "@/lib/cart";
import { useCheckoutDiscount, discountPercentFor } from "@/lib/discounts";
import { daysLabel, soldOn, fieldsFromRate, groupRates, cardLengths, groupWhen, weekdayOf } from "@/lib/rates";

// ─────────────────────────────────────────────────────────────
// Book airtime: one page, many media houses.
//
//   1. Pick the campaign (its air date is the booking date) and the advert.
//   2. Tick the slots you want on as many TV, radio and press houses as
//      you like: each station shows its full rate card, belt or programme
//      down the side and spot length (60/45/30/15/5 s) across the top.
//   3. Add them all to the cart and pay once.
//
// Each media house then confirms the date or asks to reschedule.
// Prices are the rate card's; the server prices everything again at checkout.
// ─────────────────────────────────────────────────────────────

const VAT_PERCENT = 7.5;
const CLOSED_CAMPAIGN = ["CANCELLED", "COMPLETED", "EXPIRED", "REFUNDED", "FAILED", "REJECTED"];
const TYPES = [
    { value: "ALL", label: "All media" },
    { value: "TV", label: "TV" },
    { value: "RADIO", label: "Radio" },
    { value: "PRESS", label: "Press" },
    { value: "BILLBOARD", label: "Billboards" },
    { value: "DIGITAL", label: "Digital" },
];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const todayLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const prettyDate = (d) => (d ? `${DAY_LONG[weekdayOf(d)]}, ${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : "");
const isBookableAdvert = (c) => c.status === "APPROVED" && c.fileId && c.arcon?.fileId;
const activeRates = (s) => (s.rateCard || []).filter((r) => r && r.isActive !== false && Number(r.price) > 0);

function TypeIcon({ type, className }) {
    if (type === "TV") return <Tv className={className} />;
    if (type === "PRESS") return <Newspaper className={className} />;
    if (type === "BILLBOARD") return <BillboardIcon className={className} />;
    if (type === "DIGITAL") return <Monitor className={className} />;
    return <Radio className={className} />;
}

const selectClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

// One media house with its rate card as a grid of tick boxes.
function StationRates({ station, date, picked, inCart, onToggle, open, onOpenChange, advertSeconds, availability }) {
    const rates = activeRates(station);
    const groups = groupRates(rates);
    const lengths = cardLengths(rates);
    const singles = groups.some((g) => g.options.some((o) => !o.spotSeconds));
    const currency = station.pricing?.currency || "NGN";
    const fromPrice = rates.length ? Math.min(...rates.map((r) => Number(r.price))) : null;
    const place = [station.location?.city, station.location?.state].filter(Boolean).join(", ");
    const count = rates.filter((r) => picked.has(r._id)).length;

    const cell = (rate) => {
        if (!rate) return <span className="text-slate-300 dark:text-slate-600">—</span>;
        const timing = fieldsFromRate(station, rate);
        const offDay = !soldOn(rate, date);
        const blocked = !offDay && date ? calendarProblem(availability, date, timing.time, timing.duration) : "";
        const already = inCart.has(rate._id);
        const disabled = offDay || !!blocked || already;
        const checked = picked.has(rate._id);
        const title = offDay ? `Only sold ${daysLabel(rate.days)}` : blocked || (already ? "Already in your cart for this date" : undefined);
        return (
            <label title={title} className={`inline-flex min-w-[6.5rem] cursor-pointer items-center justify-end gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                disabled ? "cursor-not-allowed border-transparent opacity-40"
                    : checked ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                        : "border-slate-200 hover:border-emerald-300 dark:border-slate-700"
            }`}>
                <span className={`text-xs font-medium ${checked ? "text-emerald-800 dark:text-emerald-200" : "text-slate-700 dark:text-slate-200"}`}>
                    {already ? "In cart" : formatMoney(rate.price, currency)}
                </span>
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} disabled={disabled} onChange={() => onToggle(station, rate)} />
            </label>
        );
    };

    return (
        <div className={`overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 ${count ? "border-emerald-400 dark:border-emerald-500/60" : "border-slate-200 dark:border-slate-800"}`}>
            <button type="button" onClick={() => onOpenChange(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" aria-expanded={open}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10">
                    {station.logo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={station.logo} alt="" className="h-full w-full object-cover" />
                        : <TypeIcon type={station.type} className="h-5 w-5 text-emerald-600" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{station.name}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {station.type}{place ? ` · ${place}` : ""} · {groups.length} slot{groups.length === 1 ? "" : "s"}
                        {lengths.length ? ` · ${lengths.map((l) => `${l}s`).join("/")}` : ""}
                        {fromPrice != null ? ` · from ${formatMoney(fromPrice, currency)}` : ""}
                    </span>
                </span>
                {count > 0 && <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">{count} picked</span>}
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {open ? <>Hide rates <ChevronUp className="h-4 w-4" /></> : <>See rates <ChevronDown className="h-4 w-4" /></>}
                </span>
            </button>

            {open && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-2 font-medium">{station.type === "PRESS" ? "Placement" : "Belt / programme"}</th>
                                    <th className="px-3 py-2 font-medium">When</th>
                                    {lengths.map((l) => (
                                        <th key={l} className={`px-3 py-2 text-right font-medium ${advertSeconds && l === advertSeconds ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                                            {l}s{advertSeconds && l === advertSeconds ? " · your advert" : ""}
                                        </th>
                                    ))}
                                    {(singles || !lengths.length) && <th className="px-3 py-2 text-right font-medium">{station.type === "PRESS" ? "Per insertion" : "Price"}</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {groups.map((g) => {
                                    const days = daysLabel(g.days);
                                    return (
                                        <tr key={g.key}>
                                            <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{g.name}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{groupWhen(g)}{days ? ` · ${days}` : ""}</td>
                                            {lengths.map((l) => <td key={l} className="px-3 py-1.5 text-right">{cell(g.options.find((o) => o.spotSeconds === l))}</td>)}
                                            {(singles || !lengths.length) && <td className="px-3 py-1.5 text-right">{cell(g.options.find((o) => !o.spotSeconds))}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-4 py-2 text-xs text-slate-400">
                        Prices per {station.type === "PRESS" ? "insertion" : "spot"}, before {VAT_PERCENT}% VAT. Faded boxes aren&apos;t sold on your air date.
                    </p>
                </div>
            )}
        </div>
    );
}

export default function BookingPage() {
    const router = useRouter();
    const params = useSearchParams();
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const cart = useCart();
    const discountOptions = useCheckoutDiscount();

    const [campaigns, setCampaigns] = useState(null);
    const [stations, setStations] = useState([]);
    const [loadError, setLoadError] = useState("");
    const [campaignId, setCampaignId] = useState(params.get("campaign") || "");
    const [creatives, setCreatives] = useState(null);
    const [creativeId, setCreativeId] = useState("");
    const [airDate, setAirDate] = useState("");
    const [picked, setPicked] = useState(() => new Map()); // rateId → { station, rate }
    const [openIds, setOpenIds] = useState(() => new Set(params.get("station") ? [params.get("station")] : []));
    const [availability, setAvailability] = useState({}); // stationId → calendar
    const [type, setType] = useState("ALL");
    const [region, setRegion] = useState("ALL");
    const [query, setQuery] = useState("");
    const [onlyPicked, setOnlyPicked] = useState(false);
    const [error, setError] = useState("");
    const [added, setAdded] = useState(null);

    useEffect(() => {
        let live = true;
        Promise.all([getCampaigns(), getStations()])
            .then(([c, s]) => {
                if (!live) return;
                setCampaigns((c?.data || []).filter((x) => !CLOSED_CAMPAIGN.includes(x.status)));
                setStations((s?.data || []).filter((x) => activeRates(x).length > 0));
            })
            .catch((err) => live && setLoadError(err?.status === 403 ? "You don't have permission to book for this account." : err?.message || "We couldn't load your campaigns and the media houses."));
        return () => { live = false; };
    }, []);

    const campaign = useMemo(() => (campaigns || []).find((c) => c._id === campaignId) || null, [campaigns, campaignId]);
    const start = dateOnly(campaign?.startDate);
    const end = dateOnly(campaign?.endDate);
    const today = todayLocal();
    // The air date is the campaign's; a longer campaign may choose a day in its run.
    const earliest = start && start < today ? today : start;
    const latest = end && end >= start ? end : "";
    const datePassed = start && start < today && (!latest || latest < today);

    // New campaign: reset advert, date and ticks.
    useEffect(() => {
        if (!campaignId) return undefined;
        let live = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreatives(null);
        setCreativeId("");
        setPicked(new Map());
        setAdded(null);
        getCreatives(campaignId)
            .then((r) => {
                if (!live) return;
                const list = r?.data || [];
                setCreatives(list);
                const ready = list.filter(isBookableAdvert);
                if (ready.length === 1) setCreativeId(ready[0]._id);
            })
            .catch(() => live && setCreatives([]));
        return () => { live = false; };
    }, [campaignId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAirDate(datePassed ? "" : earliest || "");
    }, [campaignId, earliest, datePassed]);

    // Station calendars (blocked dates, airtime hours), fetched once a station is opened.
    useEffect(() => {
        const missing = [...openIds].filter((id) => !(id in availability));
        if (!missing.length) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAvailability((prev) => ({ ...prev, ...Object.fromEntries(missing.map((id) => [id, null])) }));
        missing.forEach((id) => getStationAvailability(id)
            .then((r) => setAvailability((prev) => ({ ...prev, [id]: r?.data || null })))
            .catch(() => {}));
    }, [openIds, availability]);

    // A new date can make ticked slots unavailable: drop those.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPicked((prev) => {
            const next = new Map([...prev].filter(([, { rate }]) => soldOn(rate, airDate)));
            return next.size === prev.size ? prev : next;
        });
    }, [airDate]);

    const creative = (creatives || []).find((c) => c._id === creativeId && isBookableAdvert(c)) || null;
    const readyAdverts = (creatives || []).filter(isBookableAdvert);
    const notReady = (creatives || []).filter((c) => !isBookableAdvert(c));

    const inCart = useMemo(() => new Set(cart.items
        .filter((i) => i.campaignId === campaignId && i.date === airDate)
        .map((i) => i.rateId)), [cart.items, campaignId, airDate]);

    const regions = useMemo(() => [...new Set(stations.map((s) => s.location?.state).filter(Boolean))].sort(), [stations]);
    const pickedStations = useMemo(() => new Set([...picked.values()].map((p) => p.station._id)), [picked]);
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return stations.filter((s) =>
            (type === "ALL" || s.type === type)
            && (region === "ALL" || s.location?.state === region)
            && (!onlyPicked || pickedStations.has(s._id))
            && (!q || [s.name, s.location?.city, s.location?.state].filter(Boolean).join(" ").toLowerCase().includes(q)));
    }, [stations, type, region, query, onlyPicked, pickedStations]);

    const room = Math.max(0, MAX_CART_ITEMS - cart.count);
    const ready = !!campaign && !!creative && !!airDate;

    const toggle = (station, rate) => {
        setError("");
        setAdded(null);
        if (!ready) {
            setError(!campaign ? "Choose the campaign first." : !creative ? "Choose the advert to air first." : "Your campaign needs an air date first.");
            return;
        }
        setPicked((prev) => {
            const next = new Map(prev);
            if (next.has(rate._id)) next.delete(rate._id);
            else if (next.size >= room) {
                setError(`A cart holds ${MAX_CART_ITEMS} spots${cart.count ? ` and already has ${cart.count}` : ""}. Check out these first, then book more.`);
                return prev;
            } else next.set(rate._id, { station, rate });
            return next;
        });
    };

    // Estimate (the server prices it again): subtotal, multi-station discount, VAT.
    const summary = useMemo(() => {
        const list = [...picked.values()];
        const subtotal = list.reduce((sum, p) => sum + Number(p.rate.price || 0), 0);
        const stationCount = new Set(list.map((p) => p.station._id)).size;
        const { percent } = discountPercentFor(stationCount, discountOptions);
        const discount = Math.round(subtotal * percent) / 100;
        const vat = Math.round((subtotal - discount) * VAT_PERCENT) / 100;
        return { count: list.length, stationCount, subtotal, percent, discount, vat, total: subtotal - discount + vat };
    }, [picked, discountOptions]);

    const addToCart = (goToCheckout) => {
        setError("");
        if (!ready) return setError("Choose the campaign and advert first.");
        if (!picked.size) return setError("Tick at least one slot.");
        const items = [...picked.values()].slice(0, room).map(({ station, rate }) => {
            const timing = fieldsFromRate(station, rate);
            return {
                campaignId: campaign._id,
                campaignName: campaign.name,
                stationId: station._id,
                stationName: station.name,
                stationType: station.type || null,
                rateId: rate._id,
                rateName: rate.name,
                spotSeconds: rate.spotSeconds || null,
                creativeId: creative._id,
                creativeName: creative.name,
                price: Number(rate.price),
                currency: station.pricing?.currency || "NGN",
                slot: timing.slot,
                date: airDate,
                time: timing.time,
                duration: timing.duration,
            };
        });
        items.forEach((item) => cart.addItem(item));
        setPicked(new Map());
        if (goToCheckout) {
            router.push(`${paths.checkout}?campaign=${encodeURIComponent(campaign._id)}`);
            return;
        }
        setAdded({ count: items.length, stations: new Set(items.map((i) => i.stationId)).size });
    };

    const setOpen = (id, open) => setOpenIds((prev) => {
        const next = new Set(prev);
        if (open) next.add(id); else next.delete(id);
        return next;
    });

    if (loadError) {
        return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{loadError}</div>;
    }
    if (campaigns === null) {
        return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
    }

    const lengthNote = creative?.durationSeconds ? creative.durationSeconds : null;

    return (
        <div>
            <div className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <CalendarDays className="h-6 w-6 text-emerald-500" /> Book airtime
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Pick your campaign and advert, then tick the slots you want on as many TV, radio and press houses as you like. Pay once; each media house confirms your date.
                </p>
            </div>

            {/* Step 1: campaign, date and advert */}
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                {campaigns.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        You need a campaign before you can book.{" "}
                        <Link href={paths.campaigns} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Create a campaign</Link> with its air date first.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">1. Campaign</span>
                            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectClass}>
                                <option value="">Choose a campaign</option>
                                {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.clientBrand ? ` (${c.clientBrand})` : ""}</option>)}
                            </select>
                        </label>

                        <div>
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">2. Air date</span>
                            {!campaign ? (
                                <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400 dark:bg-slate-800">From your campaign</p>
                            ) : !start ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                    This campaign has no air date. <Link href={paths.campaigns} className="font-medium underline">Add it on the campaign</Link>.
                                </p>
                            ) : datePassed ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                    The air date ({start}) has passed. <Link href={paths.campaigns} className="font-medium underline">Change it on the campaign</Link>.
                                </p>
                            ) : latest && latest > earliest ? (
                                <>
                                    <input type="date" value={airDate} min={earliest} max={latest} onChange={(e) => setAirDate(e.target.value)} className={selectClass} />
                                    <span className="mt-1 block text-xs text-slate-400">Within your campaign ({start} to {latest}).</span>
                                </>
                            ) : (
                                <p className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{prettyDate(airDate)}</p>
                            )}
                        </div>

                        <div>
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">3. Advert to air</span>
                            {!campaign ? (
                                <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400 dark:bg-slate-800">Choose the campaign first</p>
                            ) : creatives === null ? (
                                <p className="px-1 py-2.5 text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading adverts…</p>
                            ) : readyAdverts.length === 0 ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                    {notReady.length ? "Your advert is waiting for approval or its ARCON certificate. " : "No advert yet. "}
                                    <Link href={paths.campaigns} className="font-medium underline">Upload it with its ARCON certificate</Link>.
                                </p>
                            ) : (
                                <>
                                    <select value={creativeId} onChange={(e) => setCreativeId(e.target.value)} className={selectClass}>
                                        <option value="">Choose the advert</option>
                                        {readyAdverts.map((c) => <option key={c._id} value={c._id}>{c.name}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}</option>)}
                                    </select>
                                    {creative && <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> ARCON {creative.arcon?.certificateNumber}</span>}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Step 2: media houses */}
            <section>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Tick your slots <span className="text-sm font-normal text-slate-500">({visible.length} media house{visible.length === 1 ? "" : "s"})</span></h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media houses" aria-label="Search media houses"
                                className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        </div>
                        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Media type" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {regions.length > 1 && (
                            <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="State" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                <option value="ALL">All states</option>
                                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                        )}
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" className="accent-emerald-600" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> Only ticked
                        </label>
                    </div>
                </div>

                {!ready && campaigns.length > 0 && (
                    <p className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <AlertTriangle className="h-4 w-4 text-amber-500" /> Choose your campaign and advert above, then tick slots below.
                    </p>
                )}
                {lengthNote && (
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Your advert is {lengthNote}s: book {lengthNote}s spots (or longer) so it isn&apos;t cut.</p>
                )}

                {visible.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
                        <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-300" /> No media houses match. Try another type, state or search.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {visible.map((s) => (
                            <StationRates
                                key={s._id}
                                station={s}
                                date={airDate}
                                picked={picked}
                                inCart={inCart}
                                onToggle={toggle}
                                open={openIds.has(s._id)}
                                onOpenChange={(o) => setOpen(s._id, o)}
                                advertSeconds={lengthNote}
                                availability={availability[s._id] || null}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Summary bar */}
            <div className="sticky bottom-3 z-30 mt-6 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                        {error ? (
                            <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>
                        ) : added ? (
                            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                                <Check className="h-4 w-4" /> {added.count} spot{added.count === 1 ? "" : "s"} on {added.stations} media house{added.stations === 1 ? "" : "s"} added to your cart.
                            </p>
                        ) : summary.count ? (
                            <>
                                <p className="font-semibold text-slate-900 dark:text-white">
                                    {summary.count} spot{summary.count === 1 ? "" : "s"} · {summary.stationCount} media house{summary.stationCount === 1 ? "" : "s"} · {formatMoney(summary.total, "NGN")}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {formatMoney(summary.subtotal, "NGN")}
                                    {summary.discount > 0 ? ` − ${summary.percent}% discount ${formatMoney(summary.discount, "NGN")}` : ""}
                                    {` + VAT ${formatMoney(summary.vat, "NGN")}`} · on {airDate}
                                    {summary.stationCount < 3 ? " · 3+ media houses get a discount" : ""}
                                </p>
                            </>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400">Nothing ticked yet.{cart.count ? ` ${cart.count} spot${cart.count === 1 ? "" : "s"} already in your cart.` : ""}</p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {cart.count > 0 && !summary.count && (
                            <Link href={paths.cart} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                <ShoppingCart className="h-4 w-4" /> View cart ({cart.count})
                            </Link>
                        )}
                        <button type="button" disabled={!summary.count} onClick={() => addToCart(false)}
                            className="rounded-lg border border-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                            Add to cart
                        </button>
                        <button type="button" disabled={!summary.count} onClick={() => addToCart(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                            <ShoppingCart className="h-4 w-4" /> Book &amp; pay
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
