"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarOff, Loader2, Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { getMyStations, setStationAirtime, addStationBlackout, removeStationBlackout } from "@/lib/api";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Station calendar: weekly airtime (when spots can be booked) and blocked
// periods (days off, maintenance, holidays). Advertisers can't book blocked
// times; bookings already inside a new blocked period are cancelled with a
// full refund once you confirm.

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_LABEL = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
const REASONS = [
    { value: "OFF_AIR", label: "Off air / day off" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "HOLIDAY", label: "Holiday" },
    { value: "FULLY_BOOKED", label: "Fully booked" },
    { value: "OTHER", label: "Other" },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

const inputClass =
    "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const todayLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// UI rows: mode = "any" (no limit) | "open" (start–end) | "off" (off air)
const toRows = (airtimeHours = {}) => Object.fromEntries(DAYS.map((d) => {
    if (!Object.prototype.hasOwnProperty.call(airtimeHours, d)) return [d, { mode: "any", start: "06:00", end: "22:00" }];
    const v = airtimeHours[d];
    return [d, v ? { mode: "open", start: v.start, end: v.end } : { mode: "off", start: "06:00", end: "22:00" }];
}));

const fromRows = (rows) => Object.fromEntries(
    DAYS.filter((d) => rows[d].mode !== "any").map((d) => [d, rows[d].mode === "off" ? null : { start: rows[d].start, end: rows[d].end }])
);

const EMPTY_BLOCK = { startDate: "", endDate: "", wholeDay: true, startTime: "09:00", endTime: "12:00", reason: "MAINTENANCE", note: "" };

export default function StationCalendarPage() {
    const [stations, setStations] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [rows, setRows] = useState(toRows());
    const [block, setBlock] = useState(EMPTY_BLOCK);
    const [affected, setAffected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState("");
    const [notice, setNotice] = useState(null);

    const station = stations.find((s) => s._id === selectedId);

    const load = useCallback(async (keepId) => {
        setLoading(true);
        setError(null);
        try {
            const result = await getMyStations();
            const list = result?.data || [];
            setStations(list);
            const pick = list.find((s) => s._id === keepId) || list[0];
            if (pick) {
                setSelectedId(pick._id);
                setRows(toRows(pick.airtimeHours));
            }
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const choose = (id) => {
        const s = stations.find((x) => x._id === id);
        setSelectedId(id);
        setRows(toRows(s?.airtimeHours));
        setAffected(null);
        setNotice(null);
    };

    const setRow = (day, patch) => setRows((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

    const saveHours = async () => {
        setBusy("hours");
        setNotice(null);
        try {
            await setStationAirtime(selectedId, fromRows(rows));
            setNotice({ type: "success", text: "Weekly airtime saved." });
            await load(selectedId);
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't save the airtime hours." });
        } finally {
            setBusy("");
        }
    };

    const submitBlock = async (confirm = false) => {
        setNotice(null);
        if (!block.startDate) {
            setNotice({ type: "error", text: "Choose a start date." });
            return;
        }
        setBusy("block");
        try {
            const payload = {
                startDate: block.startDate,
                endDate: block.endDate || block.startDate,
                reason: block.reason,
                note: block.note.trim(),
                ...(block.wholeDay ? {} : { startTime: block.startTime, endTime: block.endTime }),
                ...(confirm ? { cancelAffected: true } : {}),
            };
            const result = await addStationBlackout(selectedId, payload);
            setAffected(null);
            setBlock(EMPTY_BLOCK);
            setNotice({ type: "success", text: result?.message || "Dates blocked." });
            await load(selectedId);
        } catch (err) {
            if (err?.status === 409 && err?.data?.data?.affected) {
                setAffected(err.data.data.affected);
            } else {
                setNotice({ type: "error", text: err?.message || "We couldn't block these dates." });
            }
        } finally {
            setBusy("");
        }
    };

    const remove = async (blackoutId) => {
        setBusy(blackoutId);
        setNotice(null);
        try {
            await removeStationBlackout(selectedId, blackoutId);
            setNotice({ type: "success", text: "Blocked period removed. Those times can be booked again." });
            await load(selectedId);
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't remove it." });
        } finally {
            setBusy("");
        }
    };

    if (loading) return <PageLoading label="Loading your calendar…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="your calendar" onRetry={() => load(selectedId)} /></div>;
    if (!station) return <div className="p-4 sm:p-6 lg:p-8"><EmptyState icon={CalendarOff} title="No stations assigned" message="Ask a Media Masters admin to assign you to a station." /></div>;

    const upcoming = (station.blackouts || [])
        .filter((b) => String(b.endDate).slice(0, 10) >= todayLocal())
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <CalendarOff className="h-6 w-6 text-emerald-500" />
                    Calendar
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Set when spots can be booked, and block days off, maintenance and holidays.</p>
            </motion.div>

            {stations.length > 1 && (
                <select value={selectedId} onChange={(e) => choose(e.target.value)} className={`${inputClass} w-full sm:w-auto`} aria-label="Station">
                    {stations.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
            )}

            {notice && (
                <div role="status" className={`rounded-lg border p-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"}`}>
                    {notice.text}
                </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-semibold text-slate-900 dark:text-white">Weekly airtime</h2>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Bookings must fit inside these hours. &ldquo;Any time&rdquo; means no limit that day.</p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {DAYS.map((day) => (
                        <li key={day} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <span className="w-28 text-sm font-medium text-slate-900 dark:text-white">{DAY_LABEL[day]}</span>
                            <div className="flex flex-wrap items-center gap-2">
                                <select value={rows[day].mode} onChange={(e) => setRow(day, { mode: e.target.value })} className={inputClass} aria-label={`${DAY_LABEL[day]} availability`}>
                                    <option value="any">Any time</option>
                                    <option value="open">Open hours</option>
                                    <option value="off">Off air</option>
                                </select>
                                {rows[day].mode === "open" && (
                                    <>
                                        <input type="time" value={rows[day].start} onChange={(e) => setRow(day, { start: e.target.value })} className={inputClass} aria-label={`${DAY_LABEL[day]} opens`} />
                                        <span className="text-sm text-slate-400">to</span>
                                        <input type="time" value={rows[day].end} onChange={(e) => setRow(day, { end: e.target.value })} className={inputClass} aria-label={`${DAY_LABEL[day]} closes`} />
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <button type="button" onClick={saveHours} disabled={busy === "hours"} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                    {busy === "hours" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save airtime
                </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-semibold text-slate-900 dark:text-white">Block dates</h2>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Advertisers won&apos;t be able to book these dates. Leave &ldquo;whole day&rdquo; ticked to block entire days.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">From</span>
                        <input type="date" min={todayLocal()} value={block.startDate} onChange={(e) => setBlock((b) => ({ ...b, startDate: e.target.value }))} className={`${inputClass} w-full`} />
                    </label>
                    <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">To (optional)</span>
                        <input type="date" min={block.startDate || todayLocal()} value={block.endDate} onChange={(e) => setBlock((b) => ({ ...b, endDate: e.target.value }))} className={`${inputClass} w-full`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
                        <input type="checkbox" checked={block.wholeDay} onChange={(e) => setBlock((b) => ({ ...b, wholeDay: e.target.checked }))} /> Whole day
                    </label>
                    {!block.wholeDay && (
                        <div className="flex items-center gap-2 sm:col-span-2">
                            <input type="time" value={block.startTime} onChange={(e) => setBlock((b) => ({ ...b, startTime: e.target.value }))} className={inputClass} aria-label="Blocked from" />
                            <span className="text-sm text-slate-400">to</span>
                            <input type="time" value={block.endTime} onChange={(e) => setBlock((b) => ({ ...b, endTime: e.target.value }))} className={inputClass} aria-label="Blocked until" />
                        </div>
                    )}
                    <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Reason</span>
                        <select value={block.reason} onChange={(e) => setBlock((b) => ({ ...b, reason: e.target.value }))} className={`${inputClass} w-full`}>
                            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </label>
                    <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Internal note (optional)</span>
                        <input maxLength={500} value={block.note} onChange={(e) => setBlock((b) => ({ ...b, note: e.target.value }))} className={`${inputClass} w-full`} placeholder="Only your team sees this" />
                    </label>
                </div>

                {affected ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> {affected.length} booking(s) fall in this period</p>
                        <ul className="mt-2 list-disc space-y-0.5 pl-5">
                            {affected.map((b) => <li key={b._id}>{formatDate(b.date)} at {b.time} · Ref {b.bookingReference} · {b.status.toLowerCase()}</li>)}
                        </ul>
                        <p className="mt-2">Blocking these dates cancels them and refunds the advertisers in full.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => submitBlock(true)} disabled={busy === "block"} className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60">Block and refund them</button>
                            <button type="button" onClick={() => setAffected(null)} className="rounded-lg px-4 py-2 font-medium hover:bg-amber-100 dark:hover:bg-amber-500/10">Go back</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" onClick={() => submitBlock(false)} disabled={busy === "block"} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                        {busy === "block" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Block dates
                    </button>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <h2 className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900 dark:border-slate-800 dark:text-white">Upcoming blocked periods</h2>
                {upcoming.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing blocked.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {upcoming.map((b) => (
                            <li key={b._id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                                <span>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        {formatDate(b.startDate)}{String(b.endDate).slice(0, 10) !== String(b.startDate).slice(0, 10) ? ` – ${formatDate(b.endDate)}` : ""}
                                        {b.startTime ? ` · ${b.startTime}–${b.endTime}` : " · all day"}
                                    </span>
                                    <span className="block text-xs text-slate-500">{REASON_LABEL[b.reason] || b.reason}{b.note ? ` · ${b.note}` : ""}</span>
                                </span>
                                <button type="button" onClick={() => remove(b._id)} disabled={busy === b._id} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10" aria-label="Remove blocked period">
                                    {busy === b._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
