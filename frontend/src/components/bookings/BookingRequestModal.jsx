"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Loader2, CheckCircle2, ShoppingCart, ShieldCheck } from "lucide-react";
import { getCampaigns, getStations, getStationAvailability, getCreatives } from "@/lib/api";
import { calendarProblem, REASON_LABEL } from "@/lib/stationCalendar";
import { formatMoney } from "@/lib/status";
import { useSession } from "@/lib/auth";
import { useCart, advertiserPaths, MAX_CART_ITEMS } from "@/lib/cart";

// Add a spot (or a run of spots) to the booking cart:
//   campaign → advert (with its ARCON certificate) → station →
//   belt or programme → spot length (60/45/30/15 s) → date(s).
// The price comes from the station's rate card; nobody types a price, a time
// or a duration. The server prices every item again at checkout and takes
// the time window from the rate. Stations receive requests after payment.

const REPEATS = [
    { value: "ONCE", label: "Just once" },
    { value: "DAILY", label: "Every day" },
    { value: "WEEKDAYS", label: "Weekdays (Mon–Fri)" },
    { value: "WEEKLY", label: "Every week, same day" },
];

// Campaigns that can still receive booking requests.
const CLOSED_CAMPAIGN = ["CANCELLED", "COMPLETED", "EXPIRED", "REFUNDED", "FAILED", "REJECTED"];

const todayLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// YYYY-MM-DD dates from start to until (inclusive) for a repeat rule.
const runDates = (start, until, repeat, max) => {
    if (!start) return [];
    if (repeat === "ONCE" || !until || until < start) return [start];
    const out = [];
    const d = new Date(`${start}T12:00:00Z`);
    const end = new Date(`${until}T12:00:00Z`);
    while (d <= end && out.length < max) {
        const day = d.getUTCDay(); // 0 = Sunday
        if (repeat === "DAILY" || (repeat === "WEEKDAYS" && day >= 1 && day <= 5) || repeat === "WEEKLY") {
            out.push(d.toISOString().slice(0, 10));
        }
        d.setUTCDate(d.getUTCDate() + (repeat === "WEEKLY" ? 7 : 1));
    }
    return out;
};

const minutes = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };

// Same rule as the server (bookingHelpers.rateBookingFields): a time belt
// books its window; a placement (programme spot, press, billboard) the day.
const fieldsFromRate = (station, rate) => {
    if (rate.kind === "TIME_BELT" && rate.startTime && rate.endTime) {
        const s = minutes(rate.startTime), e = minutes(rate.endTime);
        const window = e > s ? e - s : 1440 - s + e;
        const slot = s >= 300 && s < 720 ? "MORNING" : s >= 720 && s < 960 ? "AFTERNOON" : s >= 960 && s < 1260 ? "PRIME_TIME" : "LATE_NIGHT";
        return { time: rate.startTime, duration: Math.max(1, Math.min(window, 1440 - s)), slot };
    }
    return { time: "06:00", duration: 1, slot: station.type === "PRESS" ? "EDITION" : station.type === "BILLBOARD" ? "DISPLAY" : "PROGRAMME" };
};

// Rate rows → choices: one per belt/programme (or press placement), each with its lengths.
const groupRates = (rates) => {
    const map = new Map();
    for (const r of rates) {
        const key = [r.name, r.kind, r.startTime || "", r.endTime || "", r.size || "", r.colour || ""].join("|");
        if (!map.has(key)) map.set(key, { key, name: r.name, kind: r.kind, startTime: r.startTime, endTime: r.endTime, size: r.size, colour: r.colour, options: [] });
        map.get(key).options.push(r);
    }
    for (const g of map.values()) g.options.sort((a, b) => (b.spotSeconds || 0) - (a.spotSeconds || 0));
    return [...map.values()];
};

const groupLabel = (g) => (g.kind === "TIME_BELT" && g.startTime ? `${g.name}` : g.name);
const groupHint = (g) => (g.kind === "TIME_BELT" && g.startTime ? `${g.startTime}–${g.endTime}` : g.size ? `${g.size}${g.colour === "BLACK_WHITE" ? " · black & white" : g.colour ? " · colour" : ""}` : "Inside the programme, on the day booked");

const isBookable = (c) => c.status === "APPROVED" && c.fileId && c.arcon?.fileId;

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const EMPTY_FORM = { campaignId: "", creativeId: "", stationId: "", groupKey: "", rateId: "", date: "", repeat: "ONCE", until: "" };

export default function BookingRequestModal({ open, station: presetStation, campaignId: presetCampaignId, onClose, onCreated }) {
    const [campaigns, setCampaigns] = useState([]);
    const [stations, setStations] = useState([]);
    const [creatives, setCreatives] = useState(null);
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [optionsError, setOptionsError] = useState("");
    const [error, setError] = useState("");
    const [added, setAdded] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const { user } = useSession();
    const cart = useCart();
    const paths = advertiserPaths(user);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        const loadOptions = async () => {
            setLoadingOptions(true);
            setOptionsError("");
            setError("");
            setAdded(null);
            setForm({ ...EMPTY_FORM, campaignId: presetCampaignId || "", stationId: presetStation?._id || "" });

            try {
                const [campaignRes, stationRes] = await Promise.all([
                    getCampaigns(),
                    presetStation ? Promise.resolve({ data: [presetStation] }) : getStations(),
                ]);
                if (cancelled) return;
                setCampaigns((campaignRes?.data || []).filter((c) => !CLOSED_CAMPAIGN.includes(c.status)));
                setStations(stationRes?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setOptionsError(
                        err?.status === 403
                            ? "You don't have permission to see campaigns, so you can't book."
                            : err?.message || "We couldn't load your campaigns and stations."
                    );
                }
            } finally {
                if (!cancelled) setLoadingOptions(false);
            }
        };

        loadOptions();
        return () => {
            cancelled = true;
        };
    }, [open, presetStation, presetCampaignId]);

    // The chosen campaign's adverts.
    useEffect(() => {
        if (!open || !form.campaignId) return undefined;
        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreatives(null);
        getCreatives(form.campaignId)
            .then((r) => { if (!cancelled) setCreatives(r?.data || []); })
            .catch(() => { if (!cancelled) setCreatives([]); });
        return () => { cancelled = true; };
    }, [open, form.campaignId]);

    const selectedStation = useMemo(() => stations.find((s) => s._id === form.stationId), [stations, form.stationId]);
    const groups = useMemo(
        () => groupRates((selectedStation?.rateCard || []).filter((r) => r && r.isActive !== false)),
        [selectedStation]
    );
    const group = groups.find((g) => g.key === form.groupKey) || null;
    const rate = group?.options.find((o) => o._id === form.rateId) || null;
    const bookable = (creatives || []).filter(isBookable);
    const waiting = (creatives || []).filter((c) => !isBookable(c));
    const creative = bookable.find((c) => c._id === form.creativeId) || null;
    const isPress = selectedStation?.type === "PRESS";
    const currency = selectedStation?.pricing?.currency || "NGN";

    // Station calendar (weekly airtime + blocked dates) for instant feedback.
    const [availability, setAvailability] = useState(null);
    useEffect(() => {
        if (!open || !form.stationId) return undefined;
        let cancelled = false;
        getStationAvailability(form.stationId)
            .then((r) => { if (!cancelled) setAvailability(r?.data || null); })
            .catch(() => { if (!cancelled) setAvailability(null); });
        return () => { cancelled = true; };
    }, [open, form.stationId]);

    const timing = rate && selectedStation ? fieldsFromRate(selectedStation, rate) : null;
    const room = Math.max(0, MAX_CART_ITEMS - cart.count);
    const dates = runDates(form.date, form.until, form.repeat, Math.max(room, 1));
    const okDates = timing ? dates.filter((d) => !calendarProblem(availability, d, timing.time, timing.duration)) : dates;
    const slotProblem = timing && form.repeat === "ONCE" && form.date ? calendarProblem(availability, form.date, timing.time, timing.duration) : null;

    const update = (field) => (e) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === "campaignId") next.creativeId = "";
            if (field === "stationId") { next.groupKey = ""; next.rateId = ""; }
            if (field === "groupKey") {
                // A single length (or a press placement) is picked automatically.
                const g = groups.find((x) => x.key === value);
                next.rateId = g && g.options.length === 1 ? g.options[0]._id : "";
            }
            return next;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (!form.campaignId) return setError("Choose a campaign.");
        if (!creative) return setError("Choose the advert to air. Upload it with its ARCON certificate on the campaign first.");
        if (!selectedStation) return setError("Choose a station.");
        if (!groups.length) return setError("This station hasn't published its rates yet, so it can't be booked.");
        if (!rate) return setError(isPress ? "Choose a placement." : "Choose a belt or programme and a spot length.");
        if (!form.date) return setError(isPress ? "Choose the publication date." : "Choose the date.");
        if (form.repeat !== "ONCE" && (!form.until || form.until < form.date)) return setError("Choose the last date for the run.");
        if (slotProblem) return setError(slotProblem);
        if (cart.isFull || room === 0) return setError(`Your cart already has ${MAX_CART_ITEMS} items. Check out first, then add more.`);
        if (!okDates.length) return setError("None of those dates are available at this station.");

        const campaign = campaigns.find((c) => c._id === form.campaignId);
        const items = okDates.slice(0, room).map((date) => ({
            campaignId: campaign._id,
            campaignName: campaign.name,
            stationId: selectedStation._id,
            stationName: selectedStation.name,
            stationType: selectedStation.type || null,
            rateId: rate._id,
            rateName: rate.name,
            spotSeconds: rate.spotSeconds || null,
            creativeId: creative._id,
            creativeName: creative.name,
            // Display only: the server prices this again and sets the time window at checkout.
            price: Number(rate.price),
            currency,
            slot: timing.slot,
            date,
            time: timing.time,
            duration: timing.duration,
        }));

        items.forEach((item) => cart.addItem(item));
        setAdded({ ...items[0], count: items.length, skipped: dates.length - okDates.length, cut: Math.max(0, okDates.length - room) });
        onCreated?.(items[0]);
    };

    const lengthWarning = creative?.durationSeconds && rate?.spotSeconds && creative.durationSeconds > rate.spotSeconds
        ? `"${creative.name}" is ${creative.durationSeconds}s but this is a ${rate.spotSeconds}s spot. The station may cut it or refuse it.`
        : null;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => onClose?.()}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="booking-request-title"
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 id="booking-request-title" className="text-lg font-semibold text-slate-900 dark:text-white">Book airtime</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    Pick your advert, then a slot from the station&apos;s rate card. Add spots from several stations, then pay once.
                                </p>
                            </div>
                            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {added ? (
                            <div className="text-center">
                                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                                <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">
                                    {added.count > 1 ? `${added.count} spots added to your cart` : "Added to your cart"}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {added.stationName} · {added.rateName}{added.spotSeconds ? ` · ${added.spotSeconds}s` : ""} · {added.count > 1 ? `from ${added.date}` : added.date} ·{" "}
                                    {formatMoney(added.price, added.currency)}{added.count > 1 ? " each" : ""} + VAT
                                </p>
                                {(added.skipped > 0 || added.cut > 0) && (
                                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                        {added.skipped > 0 ? `${added.skipped} date${added.skipped === 1 ? " was" : "s were"} skipped (station unavailable). ` : ""}
                                        {added.cut > 0 ? `${added.cut} more didn't fit: a cart holds ${MAX_CART_ITEMS} spots.` : ""}
                                    </p>
                                )}
                                <div className="mt-5 flex flex-wrap justify-center gap-2">
                                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Keep browsing</button>
                                    <Link href={paths.cart} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                                        <ShoppingCart className="h-4 w-4" /> View cart ({cart.count})
                                    </Link>
                                </div>
                            </div>
                        ) : loadingOptions ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /></div>
                        ) : optionsError ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{optionsError}</div>
                        ) : campaigns.length === 0 ? (
                            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                You need an open campaign before you can book.{" "}
                                <Link href={paths.campaigns} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Create a campaign</Link> first.
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
                                )}

                                <label className="block">
                                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign</span>
                                    <select value={form.campaignId} onChange={update("campaignId")} className={inputClass} required>
                                        <option value="">Choose a campaign</option>
                                        {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.clientBrand ? ` (${c.clientBrand})` : ""}</option>)}
                                    </select>
                                </label>

                                {form.campaignId && (
                                    <div>
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Advert to air</span>
                                        {creatives === null ? (
                                            <p className="text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading adverts…</p>
                                        ) : bookable.length === 0 ? (
                                            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                                {waiting.length ? "This campaign's adverts aren't ready yet (waiting for approval or missing an ARCON certificate). " : "This campaign has no advert yet. "}
                                                <Link href={paths.campaigns} className="font-medium underline">Upload the advert with its ARCON certificate</Link> on the campaign, then book.
                                            </p>
                                        ) : (
                                            <select value={form.creativeId} onChange={update("creativeId")} className={inputClass} required>
                                                <option value="">Choose the advert</option>
                                                {bookable.map((c) => (
                                                    <option key={c._id} value={c._id}>{c.name}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""} · ARCON {c.arcon?.certificateNumber}</option>
                                                ))}
                                            </select>
                                        )}
                                        {creative && (
                                            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> ARCON approved: {creative.arcon?.certificateNumber}</p>
                                        )}
                                    </div>
                                )}

                                <label className="block">
                                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Station</span>
                                    <select value={form.stationId} onChange={update("stationId")} className={inputClass} required disabled={!!presetStation}>
                                        <option value="">Choose a station</option>
                                        {stations.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                                    </select>
                                </label>

                                {selectedStation && groups.length === 0 && (
                                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">This station hasn&apos;t published its rates yet, so it can&apos;t be booked.</p>
                                )}

                                {groups.length > 0 && (
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{isPress ? "Placement" : "Belt or programme"}</span>
                                        <select value={form.groupKey} onChange={update("groupKey")} className={inputClass} required>
                                            <option value="">Choose from the station&apos;s rate card</option>
                                            {groups.map((g) => <option key={g.key} value={g.key}>{groupLabel(g)} · {groupHint(g)}</option>)}
                                        </select>
                                    </label>
                                )}

                                {group && group.options.length > 1 && (
                                    <div>
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Spot length</span>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {group.options.map((o) => (
                                                <button key={o._id} type="button" onClick={() => setForm((f) => ({ ...f, rateId: o._id }))}
                                                    className={`rounded-lg border px-2 py-2 text-center text-sm ${form.rateId === o._id ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-200"}`}>
                                                    <span className="block font-semibold">{o.spotSeconds ? `${o.spotSeconds}s` : "Spot"}</span>
                                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{formatMoney(o.price, currency)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {rate && (
                                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                                        <span className="font-semibold">{formatMoney(rate.price, currency)}</span> per {isPress ? "insertion" : `${rate.spotSeconds ? `${rate.spotSeconds}-second ` : ""}spot`} + 7.5% VAT
                                        {rate.kind === "TIME_BELT" ? ` · airs between ${rate.startTime} and ${rate.endTime}` : ""}
                                        <span className="block text-xs text-emerald-700 dark:text-emerald-300">Price from the station&apos;s rate card. 3+ stations in one checkout get a discount.</span>
                                    </p>
                                )}
                                {lengthWarning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{lengthWarning}</p>}

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{isPress ? "Publication date" : "Date"}</span>
                                        <input type="date" min={todayLocal()} value={form.date} onChange={update("date")} className={inputClass} required />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Repeat</span>
                                        <select value={form.repeat} onChange={update("repeat")} className={inputClass}>
                                            {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </label>
                                    {form.repeat !== "ONCE" && (
                                        <label className="block">
                                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Until</span>
                                            <input type="date" min={form.date || todayLocal()} value={form.until} onChange={update("until")} className={inputClass} required />
                                        </label>
                                    )}
                                </div>

                                {form.repeat !== "ONCE" && form.date && form.until && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                                        {okDates.length} spot{okDates.length === 1 ? "" : "s"} in this run
                                        {dates.length > okDates.length ? ` (${dates.length - okDates.length} date${dates.length - okDates.length === 1 ? "" : "s"} unavailable, skipped)` : ""}
                                        {rate ? ` · ${formatMoney(Number(rate.price) * Math.min(okDates.length, room), currency)} before VAT and any discount` : ""}
                                        {okDates.length > room ? ` · only ${room} fit in your cart` : ""}.
                                    </p>
                                )}

                                {availability && (availability.blackouts || []).length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        <span className="font-medium">Unavailable:</span>{" "}
                                        {availability.blackouts.slice(0, 6).map((b) => `${b.startDate}${b.endDate !== b.startDate ? ` to ${b.endDate}` : ""}${b.startTime ? ` ${b.startTime}–${b.endTime}` : ""} (${REASON_LABEL[b.reason] || "unavailable"})`).join("; ")}
                                        {availability.blackouts.length > 6 ? "; …" : ""}
                                    </div>
                                )}

                                {slotProblem && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{slotProblem}</p>}

                                <div className="flex justify-end gap-2 pt-2">
                                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                                    <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                                        <ShoppingCart className="h-4 w-4" />
                                        {form.repeat !== "ONCE" && okDates.length > 1 ? `Add ${Math.min(okDates.length, room)} spots` : "Add to cart"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
