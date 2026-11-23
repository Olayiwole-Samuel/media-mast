"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, CalendarX2, MoveRight } from "lucide-react";
import { getBookings, bulkCampaignSpots } from "@/lib/api";
import { walletChanged } from "@/lib/wallet";
import { announceDataChanged } from "@/lib/events";

// Change many upcoming spots of a campaign at once: tick spots (or pick a
// media house and a date) and cancel them (refunded per the cancellation
// rules) or move them to another day (back to the media house to confirm).

const LIVE = ["PENDING", "ACCEPTED", "SCHEDULED", "CHANGES_REQUESTED"];
const fmt = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const STATUS = { PENDING: "Waiting for media house", ACCEPTED: "Accepted", SCHEDULED: "Scheduled", CHANGES_REQUESTED: "Reschedule asked" };

export default function ManageSpots({ campaign, onClose, onDone }) {
    const [spots, setSpots] = useState(null);
    const [picked, setPicked] = useState(() => new Set());
    const [station, setStation] = useState("ALL");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const load = () => getBookings()
        .then((r) => setSpots((r.data || []).filter((b) => String(b.campaignId?._id || b.campaignId) === String(campaign._id) && LIVE.includes(b.status))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))))
        .catch(() => setSpots([]));
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const stations = useMemo(() => [...new Map((spots || []).map((b) => [String(b.stationId?._id || b.stationId), b.stationId?.name || "Media house"])).entries()], [spots]);
    const visible = (spots || []).filter((b) => (station === "ALL" || String(b.stationId?._id || b.stationId) === station) && (!fromDate || String(b.date).slice(0, 10) >= fromDate));
    const allPicked = visible.length > 0 && visible.every((b) => picked.has(b._id));
    const toggleAll = () => setPicked((p) => { const n = new Set(p); if (allPicked) visible.forEach((b) => n.delete(b._id)); else visible.forEach((b) => n.add(b._id)); return n; });
    const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const chosen = [...picked].filter((id) => visible.some((b) => b._id === id));

    const run = async (action) => {
        if (!chosen.length) return setMessage({ type: "error", text: "Tick the spots first." });
        if (action === "MOVE" && !toDate) return setMessage({ type: "error", text: "Choose the new date." });
        if (action === "CANCEL" && !window.confirm(`Cancel ${chosen.length} spot${chosen.length === 1 ? "" : "s"}? Refunds follow the cancellation rules (spots close to airing may carry a fee).`)) return;
        setBusy(true); setMessage(null);
        try {
            const res = await bulkCampaignSpots(campaign._id, action === "MOVE" ? { action, bookingIds: chosen, toDate } : { action, bookingIds: chosen });
            const skipped = res.data?.skipped || [];
            setMessage({ type: skipped.length ? "warn" : "success", text: res.message, skipped });
            setPicked(new Set());
            walletChanged(); announceDataChanged();
            await load();
            onDone?.();
        } catch (e) {
            setMessage({ type: "error", text: e?.message || "Couldn't update the spots." });
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="manage-title" onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
                    <div>
                        <h2 id="manage-title" className="text-lg font-semibold text-slate-900 dark:text-white">Manage spots: {campaign.name}</h2>
                        <p className="text-sm text-slate-500">Tick upcoming spots, then cancel them or move them to another day.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5 text-slate-500" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
                    <select value={station} onChange={(e) => setStation(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                        <option value="ALL">All media houses</option>
                        {stations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                    <label className="ml-auto flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><input type="checkbox" className="accent-emerald-600" checked={allPicked} onChange={toggleAll} /> Tick all {visible.length}</label>
                </div>
                <div className="min-h-[200px] flex-1 overflow-y-auto px-5 py-2">
                    {spots === null ? <p className="py-6 text-center text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading spots…</p>
                        : visible.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No upcoming spots match.</p>
                            : (
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {visible.map((b) => (
                                        <li key={b._id}>
                                            <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                                                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={picked.has(b._id)} onChange={() => toggle(b._id)} />
                                                <span className="w-28 shrink-0 text-slate-700 dark:text-slate-200">{fmt(b.date)} {b.time}</span>
                                                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{b.stationId?.name || "Media house"} · {b.rateName || b.slot}{b.spotSeconds ? ` · ${b.spotSeconds}s` : ""}</span>
                                                <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{STATUS[b.status]}</span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </div>
                <div className="space-y-2 border-t border-slate-100 p-5 dark:border-slate-800">
                    {message && (
                        <div className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : message.type === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                            {message.text}
                            {message.skipped?.length > 0 && <ul className="mt-1 text-xs">{message.skipped.slice(0, 5).map((s) => <li key={s.bookingReference}>{s.bookingReference}: {s.reason}</li>)}</ul>}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-500">{chosen.length} ticked</span>
                        <button type="button" disabled={busy || !chosen.length} onClick={() => run("CANCEL")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300"><CalendarX2 className="h-4 w-4" /> Cancel ticked</button>
                        <span className="ml-auto flex items-center gap-2">
                            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="New date" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                            <button type="button" disabled={busy || !chosen.length} onClick={() => run("MOVE")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveRight className="h-4 w-4" />} Move ticked</button>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
