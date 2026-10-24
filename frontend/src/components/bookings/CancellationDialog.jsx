"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/status";

// Shows what cancelling will refund (from the server's policy quote) before
// the advertiser confirms. Policy: free before the campaign starts; no
// no cancelling within 2 hours of airing; once the campaign is running a
// 10–20% fee applies, growing with progress. Station-caused cancellations
// are always refunded in full.
//
// loadQuote(): Promise<{ single quote } | { totals, items[] }>
// onConfirm(): Promise<string>  — the success message to show
export default function CancellationDialog({ open, title, currency = "NGN", loadQuote, onConfirm, onClose }) {
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [working, setWorking] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuote(null);
        setError("");
        setLoading(true);
        loadQuote()
            .then((q) => { if (!cancelled) setQuote(q); })
            .catch((err) => { if (!cancelled) setError(err?.message || "We couldn't work out the refund."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, loadQuote]);

    const confirm = async () => {
        setWorking(true);
        setError("");
        try {
            await onConfirm();
        } catch (err) {
            setError(err?.message || "We couldn't cancel. Please try again.");
            setWorking(false);
        }
    };

    const isCampaign = quote && Array.isArray(quote.items);
    const refund = isCampaign ? quote.totals?.refundAmount : quote?.refundAmount;
    const fee = isCampaign ? quote.totals?.fee : quote?.fee;
    const cancellable = quote ? quote.cancellable !== false : false;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !working && onClose?.()}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cancel-dialog-title"
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <h2 id="cancel-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
                            <button type="button" onClick={onClose} disabled={working} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /></div>
                        ) : quote ? (
                            <div className="space-y-4 text-sm">
                                {!isCampaign && <p className="text-slate-600 dark:text-slate-300">{quote.explanation}</p>}
                                {isCampaign && (
                                    <p className="text-slate-600 dark:text-slate-300">
                                        {quote.items.length} spot{quote.items.length === 1 ? "" : "s"} that haven&apos;t aired will be cancelled
                                        {quote.spotsAlreadyAired ? `; ${quote.spotsAlreadyAired} already aired and stay paid` : ""}.
                                    </p>
                                )}

                                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-slate-400">You get back</p>
                                        <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(refund || 0, currency)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-slate-400">Cancellation fee</p>
                                        <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(fee || 0, currency)}</p>
                                    </div>
                                </div>

                                {isCampaign && quote.items.length > 0 && (
                                    <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                                        {quote.items.map((it) => (
                                            <li key={it.bookingId} className="flex justify-between gap-3 px-3 py-2">
                                                <span className="text-slate-700 dark:text-slate-200">{it.station || "Station"} · {formatDate(it.airsAt)}<span className="block text-xs text-slate-400">{it.explanation}</span></span>
                                                <span className="shrink-0 text-right text-slate-900 dark:text-white">{formatMoney(it.refundAmount, currency)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <p className="flex gap-2 text-xs text-slate-400"><AlertTriangle className="h-4 w-4 shrink-0" /> Free before your campaign starts. Cancellations close 2 hours before broadcast. Once running, a 10–20% fee applies based on progress.</p>
                                {!cancellable && <p className="rounded-lg bg-slate-100 p-3 text-slate-600 dark:bg-slate-800 dark:text-slate-300">This can no longer be cancelled.</p>}
                            </div>
                        ) : null}

                        {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>}

                        <div className="mt-6 flex justify-end gap-2">
                            <button type="button" onClick={onClose} disabled={working} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Keep it</button>
                            <button type="button" onClick={confirm} disabled={working || loading || !quote || !cancellable} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                                {working && <Loader2 className="h-4 w-4 animate-spin" />} Confirm cancellation
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
