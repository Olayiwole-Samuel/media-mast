"use client";

import { useState } from "react";
import { X, FileText, Film, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { bookingProofPath, confirmBookingAired, disputeBooking, fetchFileUrl } from "@/lib/api";
import { DISPUTE_REASONS, formatDate, formatMoney } from "@/lib/status";
import { walletChanged } from "@/lib/wallet";

// The media house says a spot aired. The advertiser checks the TX log and the
// clip, then confirms (the station is paid now) or disputes it (the money stays
// on hold for Media Masters to review). Doing nothing pays the station when the
// dispute window ends.

const timeLeft = (until) => {
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) return "closing now";
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h ? `${h}h ${m}m left` : `${m}m left`;
};

export default function AiredReview({ booking, onClose, onDone }) {
    const [mode, setMode] = useState("review"); // review | dispute
    const [reason, setReason] = useState("NOT_AIRED");
    const [details, setDetails] = useState("");
    const [busy, setBusy] = useState(false);
    const [opening, setOpening] = useState(null);
    const [error, setError] = useState("");
    const escrow = booking.escrow || {};

    const open = async (which) => {
        setOpening(which);
        setError("");
        // Open the tab now (while the click counts), then point it at the file.
        const tab = window.open("about:blank", "_blank");
        try {
            const url = await fetchFileUrl(bookingProofPath(booking._id, which));
            if (tab) tab.location.href = url;
            else window.location.assign(url);
        } catch (err) {
            tab?.close();
            setError(err?.message || "Couldn't open the file.");
        } finally {
            setOpening(null);
        }
    };

    const confirm = async () => {
        setBusy(true);
        setError("");
        try {
            const res = await confirmBookingAired(booking._id);
            walletChanged();
            onDone?.(res?.message || "Confirmed.", { ...booking, escrow: { ...escrow, status: "RELEASED" } });
        } catch (err) {
            setError(err?.message || "Couldn't confirm.");
            setBusy(false);
        }
    };

    const dispute = async () => {
        if (!details.trim()) return setError("Tell us what went wrong.");
        setBusy(true);
        setError("");
        try {
            const res = await disputeBooking(booking._id, { reason, details: details.trim() });
            onDone?.(res?.message || "Dispute raised.", { ...booking, escrow: { ...escrow, status: "DISPUTED", dispute: { reason, details } } });
        } catch (err) {
            setError(err?.message || "Couldn't raise the dispute.");
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="aired-title" onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2 id="aired-title" className="text-lg font-semibold text-slate-900 dark:text-white">Your spot aired</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {booking.stationId?.name || "The media house"} · {booking.rateName || "spot"}{booking.spotSeconds ? ` · ${booking.spotSeconds}s` : ""} · {formatDate(booking.date)}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5 text-slate-500" /></button>
                </div>

                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    {formatMoney(escrow.amount || 0, booking.currency)} is on hold. Check the proof below. If you do nothing, it&apos;s paid to the media house when the window closes
                    {escrow.releaseAt ? <> (<span className="font-semibold">{timeLeft(escrow.releaseAt)}</span>)</> : null}.
                </p>

                <div className="mb-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => open("log")} disabled={!!opening} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        {opening === "log" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} TX log
                    </button>
                    <button type="button" onClick={() => open("clip")} disabled={!!opening} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        {opening === "clip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />} Clip on air
                    </button>
                </div>
                {escrow.proof?.note && <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Media house note: &ldquo;{escrow.proof.note}&rdquo;</p>}

                {error && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

                {mode === "review" ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" disabled={busy} onClick={confirm} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} It aired fine: pay now
                        </button>
                        <button type="button" disabled={busy} onClick={() => setMode("dispute")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
                            <AlertTriangle className="h-4 w-4" /> Something&apos;s wrong
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">What went wrong?</span>
                            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                                {DISPUTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </label>
                        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={2000} placeholder="Tell us what you saw or heard, e.g. we were watching at 22:15 and it didn't play"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">The money stays on hold while Media Masters reviews both sides.</p>
                        <div className="flex gap-2">
                            <button type="button" disabled={busy} onClick={dispute} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60">
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Raise dispute
                            </button>
                            <button type="button" disabled={busy} onClick={() => setMode("review")} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Back</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
