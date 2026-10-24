"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Loader2, CheckCircle2, ShoppingCart } from "lucide-react";
import { getCampaigns, getStations, getStationAvailability } from "@/lib/api";
import { calendarProblem, REASON_LABEL } from "@/lib/stationCalendar";
import { formatMoney } from "@/lib/status";
import { useSession } from "@/lib/auth";
import { useCart, advertiserPaths, MAX_CART_ITEMS } from "@/lib/cart";

// Add a spot (or a run of spots) to the booking cart. Nothing is sent to the
// station yet: the advertiser pays once for the whole cart at checkout, and
// only then do the stations receive the requests. Prices shown come from the
// station's rate card (or its standard price); the server prices every item
// again at checkout.

const SLOTS = [
    { value: "MORNING", label: "Morning" },
    { value: "AFTERNOON", label: "Afternoon" },
    { value: "PRIME_TIME", label: "Prime time" },
    { value: "LATE_NIGHT", label: "Late night" },
];

// Time of day follows the start time, so the two can never disagree:
// 05:00–11:59 morning, 12:00–15:59 afternoon, 16:00–20:59 prime time, otherwise late night.
const slotForTime = (time) => {
    const hour = Number(String(time || "").split(":")[0]);
    if (!Number.isFinite(hour) || !time) return null;
    if (hour >= 5 && hour < 12) return "MORNING";
    if (hour >= 12 && hour < 16) return "AFTERNOON";
    if (hour >= 16 && hour < 21) return "PRIME_TIME";
    return "LATE_NIGHT";
};

const REPEATS = [
    { value: "ONCE", label: "Just once" },
    { value: "DAILY", label: "Every day" },
    { value: "WEEKDAYS", label: "Weekdays (Mon–Fri)" },
    { value: "WEEKLY", label: "Every week, same day" },
];

// Press ads run in an edition, not at a time: they are booked for the day.
const PRESS_TIME = "06:00";
const PRESS_DURATION = 1;

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

const rateLabel = (r) => {
    const bits = [r.name];
    if (r.kind === "TIME_BELT" && r.startTime) bits.push(`${r.startTime}–${r.endTime}`);
    if (r.spotSeconds) bits.push(`${r.spotSeconds}s`);
    return `${bits.join(" · ")} — ${formatMoney(r.price, "NGN")}`;
};

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const EMPTY_FORM = { campaignId: "", stationId: "", rateId: "", slot: "PRIME_TIME", date: "", time: "", duration: 30, repeat: "ONCE", until: "" };

export default function BookingRequestModal({ open, station: presetStation, campaignId: presetCampaignId, onClose, onCreated }) {
    const [campaigns, setCampaigns] = useState([]);
    const [stations, setStations] = useState([]);
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

    const selectedStation = useMemo(
        () => stations.find((s) => s._id === form.stationId),
        [stations, form.stationId]
    );
    const rates = useMemo(
        () => (selectedStation?.rateCard || []).filter((r) => r && r.isActive !== false),
        [selectedStation]
    );
    const selectedRate = rates.find((r) => r._id === form.rateId) || null;
    const isPress = selectedStation?.type === "PRESS";

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

    const time = isPress ? PRESS_TIME : form.time;
    const duration = isPress ? PRESS_DURATION : Number(form.duration);
    const room = Math.max(0, MAX_CART_ITEMS - cart.count);
    const dates = runDates(form.date, form.until, form.repeat, Math.max(room, 1));
    const okDates = dates.filter((d) => !calendarProblem(availability, d, time, duration));
    const slotProblem = form.repeat === "ONCE" ? calendarProblem(availability, form.date, time, duration) : null;

    const update = (field) => (e) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === "stationId") next.rateId = "";
            // Picking a time belt fills in its start time when none is set yet.
            if (field === "rateId") {
                const r = (stations.find((s) => s._id === prev.stationId)?.rateCard || []).find((x) => x._id === value);
                if (r?.kind === "TIME_BELT" && r.startTime && !prev.time) next.time = r.startTime;
            }
            return next;
        });
    };

    const unitPrice = selectedRate
        ? Number(selectedRate.price)
        : Number(selectedStation?.pricing?.amount) > 0 ? Number(selectedStation.pricing.amount) : null;

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (!form.campaignId || !form.stationId || !form.date || (!isPress && !form.time)) {
            setError(isPress ? "Please choose a campaign, publication and date." : "Please choose a campaign, station, date and start time.");
            return;
        }
        if (rates.length && !selectedRate) {
            setError("Choose a rate from this station's rate card.");
            return;
        }
        if (!isPress && (!Number.isInteger(duration) || duration <= 0 || duration > 1440)) {
            setError("Please enter how long the slot should be, in whole minutes.");
            return;
        }
        if (form.repeat !== "ONCE" && (!form.until || form.until < form.date)) {
            setError("Choose the last date for the run.");
            return;
        }
        if (slotProblem) {
            setError(slotProblem);
            return;
        }
        if (cart.isFull || room === 0) {
            setError(`Your cart already has ${MAX_CART_ITEMS} items. Check out first, then add more.`);
            return;
        }
        if (!okDates.length) {
            setError("None of those dates are available at this station.");
            return;
        }

        const campaign = campaigns.find((c) => c._id === form.campaignId);
        const station = stations.find((s) => s._id === form.stationId);
        if (!campaign || !station) {
            setError("Please choose a campaign and station from the list.");
            return;
        }

        const items = okDates.slice(0, room).map((date) => ({
            campaignId: campaign._id,
            campaignName: campaign.name,
            stationId: station._id,
            stationName: station.name,
            stationType: station.type || null,
            rateId: selectedRate?._id || null,
            rateName: selectedRate?.name || null,
            // Display only: the server prices this again at checkout.
            price: unitPrice,
            currency: station.pricing?.currency || "NGN",
            slot: isPress ? "EDITION" : slotForTime(time) || form.slot,
            date,
            time,
            duration,
        }));

        items.forEach((item) => cart.addItem(item));
        setAdded({
            ...items[0],
            count: items.length,
            skipped: dates.length - okDates.length,
            cut: Math.max(0, okDates.length - room),
        });
        onCreated?.(items[0]);
    };

    return (
        <AnimatePresence>
            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                    onClick={() => onClose?.()}
                >
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
                                <h2 id="booking-request-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                                    Add to cart
                                </h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    Add spots from as many stations as you like, then pay once. Stations receive your requests after payment.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                                aria-label="Close"
                            >
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
                                    {added.stationName}{added.rateName ? ` · ${added.rateName}` : ""} · {added.count > 1 ? `from ${added.date}` : `${added.date}${isPress ? "" : ` at ${added.time}`}`} ·{" "}
                                    {added.price ? `${formatMoney(added.price, added.currency)}${added.count > 1 ? " each" : ""}` : "price confirmed at checkout"}
                                </p>
                                {(added.skipped > 0 || added.cut > 0) && (
                                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                        {added.skipped > 0 ? `${added.skipped} date${added.skipped === 1 ? " was" : "s were"} skipped (station unavailable). ` : ""}
                                        {added.cut > 0 ? `${added.cut} more didn't fit: a cart holds ${MAX_CART_ITEMS} spots.` : ""}
                                    </p>
                                )}
                                <div className="mt-5 flex flex-wrap justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        Keep browsing
                                    </button>
                                    <Link
                                        href={paths.cart}
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
                                    >
                                        <ShoppingCart className="h-4 w-4" />
                                        View cart ({cart.count})
                                    </Link>
                                </div>
                            </div>
                        ) : loadingOptions ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                            </div>
                        ) : optionsError ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                                {optionsError}
                            </div>
                        ) : campaigns.length === 0 ? (
                            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                You need an open campaign before you can book.{" "}
                                <Link href={paths.campaigns} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                                    Create a campaign
                                </Link>{" "}
                                first.
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                                        {error}
                                    </div>
                                )}

                                <label className="block">
                                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign</span>
                                    <select value={form.campaignId} onChange={update("campaignId")} className={inputClass} required>
                                        <option value="">Choose a campaign</option>
                                        {campaigns.map((c) => (
                                            <option key={c._id} value={c._id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block">
                                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Station</span>
                                    <select
                                        value={form.stationId}
                                        onChange={update("stationId")}
                                        className={inputClass}
                                        required
                                        disabled={!!presetStation}
                                    >
                                        <option value="">Choose a station</option>
                                        {stations.map((s) => (
                                            <option key={s._id} value={s._id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                {rates.length > 0 && (
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Rate</span>
                                        <select value={form.rateId} onChange={update("rateId")} className={inputClass} required>
                                            <option value="">Choose from the station&apos;s rate card</option>
                                            {rates.map((r) => (
                                                <option key={r._id} value={r._id}>{rateLabel(r)}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                {selectedStation && (
                                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                                        {unitPrice ? `Price: ${formatMoney(unitPrice, selectedStation.pricing?.currency)} per ${isPress ? "insertion" : "spot"}` : rates.length ? "Choose a rate to see the price" : "Price not listed"}
                                        {selectedRate?.kind === "TIME_BELT" ? ` · spots must start between ${selectedRate.startTime} and ${selectedRate.endTime}` : ""}
                                        . Booking 3 or more stations in one checkout gets a discount.
                                    </p>
                                )}

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{isPress ? "Publication date" : "Date"}</span>
                                        <input type="date" min={todayLocal()} value={form.date} onChange={update("date")} className={inputClass} required />
                                    </label>
                                    {!isPress && (
                                        <>
                                            <label className="block">
                                                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start time</span>
                                                <input type="time" value={form.time} onChange={update("time")} className={inputClass} required />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Time of day</span>
                                                <p className={`${inputClass} text-slate-600 dark:text-slate-300`} aria-live="polite">
                                                    {SLOTS.find((s) => s.value === slotForTime(form.time))?.label || "Set from the start time"}
                                                </p>
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Length (minutes)</span>
                                                <input type="number" min="1" max="1440" value={form.duration} onChange={update("duration")} className={inputClass} required />
                                            </label>
                                        </>
                                    )}
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
                                        {unitPrice ? ` · ${formatMoney(unitPrice * Math.min(okDates.length, room), selectedStation?.pricing?.currency)} before any discount` : ""}
                                        {okDates.length > room ? ` · only ${room} fit in your cart` : ""}.
                                    </p>
                                )}

                                {availability && ((availability.blackouts || []).length > 0 || Object.keys(availability.airtimeHours || {}).length > 0) && (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        {Object.keys(availability.airtimeHours || {}).length > 0 && (
                                            <p>
                                                <span className="font-medium">Airtime:</span>{" "}
                                                {Object.entries(availability.airtimeHours).map(([d, v]) => `${d.slice(0, 3)} ${v ? `${v.start}–${v.end}` : "off"}`).join(" · ")}
                                            </p>
                                        )}
                                        {(availability.blackouts || []).length > 0 && (
                                            <p className="mt-1">
                                                <span className="font-medium">Unavailable:</span>{" "}
                                                {availability.blackouts.slice(0, 6).map((b) => `${b.startDate}${b.endDate !== b.startDate ? ` to ${b.endDate}` : ""}${b.startTime ? ` ${b.startTime}–${b.endTime}` : ""} (${REASON_LABEL[b.reason] || "unavailable"})`).join("; ")}
                                                {availability.blackouts.length > 6 ? "; …" : ""}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {slotProblem && (
                                    <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{slotProblem}</p>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
                                    >
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
