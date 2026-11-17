"use client";

import { useState } from "react";
import { PackageCheck, CalendarCheck2, FileText, Film, Loader2 } from "lucide-react";
import { acceptStationOrder, markStationDayAired, uploadFileInParts } from "@/lib/api";
import { formatMoney, formatDate, spotHasAired } from "@/lib/status";

// Media plans send a media house many spots at once. Two shortcuts:
//   New orders: accept every new spot of one plan in one go (decline single
//               dates on the list below).
//   Confirm by day: one TX log and one clip mark all of a day's aired spots.

const idOf = (v) => (v && v._id ? v._id : v);
const range = (list) => {
    const ds = list.map((b) => String(b.date).slice(0, 10)).sort();
    return ds[0] === ds[ds.length - 1] ? formatDate(ds[0]) : `${formatDate(ds[0])} to ${formatDate(ds[ds.length - 1])}`;
};
const netOf = (b) => Number(b.pricing?.net ?? b.price ?? 0);

function OrderRow({ order, onDone }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const accept = async () => {
        setBusy(true); setError("");
        try {
            const res = await acceptStationOrder(order.paymentId);
            onDone(res?.message || "Order accepted.");
        } catch (err) {
            setError(err?.message || "Couldn't accept the order.");
            setBusy(false);
        }
    };
    return (
        <li className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900 dark:text-white">{order.campaign} · {order.advertiser}</p>
                <p className="text-slate-500 dark:text-slate-400">{order.list.length} spots · {order.programmes.join(", ")} · {range(order.list)} · {formatMoney(order.net, "NGN")} net, paid as they air</p>
                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <button type="button" disabled={busy} onClick={accept} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Accept all {order.list.length}
            </button>
        </li>
    );
}

function DayRow({ day, onDone }) {
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState(null);
    const [clip, setClip] = useState(null);
    const [note, setNote] = useState("");
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState("");
    const needsProof = day.list.some((b) => b.escrow?.status === "HELD");

    const submit = async () => {
        setError("");
        if (needsProof && (!log || !clip)) return setError("Attach the day's TX log and a clip.");
        try {
            let ids = {};
            if (needsProof) {
                setProgress(0);
                const l = await uploadFileInParts(log, "PROOF_LOG", (p) => setProgress(p * 0.2));
                const c = await uploadFileInParts(clip, "PROOF_CLIP", (p) => setProgress(0.2 + p * 0.8));
                ids = { logUploadId: l.uploadId, clipUploadId: c.uploadId };
            }
            const res = await markStationDayAired(day.stationId, { date: day.date, note: note.trim() || undefined, ...ids });
            onDone(res?.message || "Day marked aired.");
        } catch (err) {
            setProgress(null);
            setError(err?.message || "Couldn't mark the day aired.");
        }
    };

    const box = (label, Icon, file, setFile, accept) => (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm hover:border-emerald-400 dark:border-slate-700">
            <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate">{file ? file.name : label}</span>
            <input type="file" accept={accept} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
    );

    return (
        <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm"><span className="font-medium text-slate-900 dark:text-white">{formatDate(day.date)} · {day.station}</span> <span className="text-slate-500">· {day.list.length} spot{day.list.length === 1 ? "" : "s"} · {day.programmes.join(", ")}</span></p>
                {!open && <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"><CalendarCheck2 className="h-4 w-4" /> Mark day aired</button>}
            </div>
            {open && (
                <div className="mt-3 space-y-2">
                    {needsProof && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {box("The day's TX log", FileText, log, setLog, ".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx,.csv")}
                            {box("A clip from the day", Film, clip, setClip, "video/*,audio/*,image/*")}
                        </div>
                    )}
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Optional note (e.g. times aired)" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    {progress !== null && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Uploading… {Math.round(progress * 100)}%</p>}
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <button type="button" disabled={progress !== null} onClick={submit} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">Confirm {day.list.length} aired</button>
                        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                    </div>
                    <p className="text-xs text-slate-400">A spot that didn&apos;t air? Use &ldquo;It didn&apos;t air&rdquo; on that spot below first, so the advertiser is refunded.</p>
                </div>
            )}
        </li>
    );
}

export default function StationBulkPanels({ bookings, onChanged }) {
    // New orders: pending spots grouped by plan (payment).
    const orders = new Map();
    for (const b of bookings) {
        if (b.status !== "PENDING" || !b.paymentId) continue;
        const key = String(idOf(b.paymentId));
        if (!orders.has(key)) orders.set(key, { paymentId: key, campaign: b.campaignId?.name || "Campaign", advertiser: b.companyId?.name || b.userId?.name || "Advertiser", list: [], programmes: new Set(), net: 0 });
        const o = orders.get(key);
        o.list.push(b);
        o.programmes.add(b.rateName || b.slot);
        o.net += netOf(b);
    }
    const orderList = [...orders.values()].filter((o) => o.list.length > 1).map((o) => ({ ...o, programmes: [...o.programmes] }));

    // Days to confirm: accepted/scheduled spots whose slot has ended, by media house and day.
    const days = new Map();
    for (const b of bookings) {
        if (!["ACCEPTED", "SCHEDULED"].includes(b.status) || !spotHasAired(b)) continue;
        const date = String(b.date).slice(0, 10);
        const stationId = String(idOf(b.stationId));
        const key = `${stationId}|${date}`;
        if (!days.has(key)) days.set(key, { stationId, station: b.stationId?.name || "Media house", date, list: [], programmes: new Set() });
        days.get(key).list.push(b);
        days.get(key).programmes.add(b.rateName || b.slot);
    }
    const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, programmes: [...d.programmes] }));

    if (!orderList.length && !dayList.length) return null;
    return (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {orderList.length > 0 && (
                <section className="rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-500/20 dark:bg-slate-900">
                    <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><PackageCheck className="h-5 w-5 text-emerald-500" /> New orders ({orderList.length})</h2>
                    <ul className="space-y-2">{orderList.map((o) => <OrderRow key={o.paymentId} order={o} onDone={onChanged} />)}</ul>
                </section>
            )}
            {dayList.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/20 dark:bg-slate-900">
                    <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><CalendarCheck2 className="h-5 w-5 text-amber-500" /> Confirm aired, by day ({dayList.length})</h2>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">You&apos;re paid for each day once it&apos;s confirmed and the advertiser&apos;s check window passes.</p>
                    <ul className="space-y-2">{dayList.slice(0, 30).map((d) => <DayRow key={`${d.stationId}-${d.date}`} day={d} onDone={onChanged} />)}</ul>
                </section>
            )}
        </div>
    );
}
