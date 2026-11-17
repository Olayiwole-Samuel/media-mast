"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCampaignTracker } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/status";

// Campaign tracker: per media house, spots planned / aired / waiting for the
// media house to confirm / upcoming, and the money held, spent and refunded.
export default function CampaignTracker({ campaignId }) {
    const [state, setState] = useState({ loading: true, data: null, error: "" });

    useEffect(() => {
        let live = true;
        getCampaignTracker(campaignId)
            .then((r) => live && setState({ loading: false, data: r?.data || null, error: "" }))
            .catch((err) => live && setState({ loading: false, data: null, error: err?.message || "Couldn't load the tracker." }));
        return () => { live = false; };
    }, [campaignId]);

    if (state.loading) return <p className="text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading the tracker…</p>;
    if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
    const t = state.data?.totals;
    if (!t || !t.planned) return <p className="text-sm text-slate-500 dark:text-slate-400">Nothing booked yet.</p>;
    const pct = t.planned ? Math.round((t.aired / t.planned) * 100) : 0;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[["Spots aired", `${t.aired} / ${t.planned}`], ["Upcoming", t.upcoming], ["On hold", formatMoney(t.held)], ["Spent (aired)", formatMoney(t.spent)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
                        <p className="font-semibold text-slate-900 dark:text-white">{v}</p>
                    </div>
                ))}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-label={`${pct}% of spots aired`}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            {(t.toConfirm > 0 || t.disputed > 0 || t.notAired > 0 || t.refunded > 0) && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[t.toConfirm ? `${t.toConfirm} past spots waiting for the media house to confirm` : null, t.disputed ? `${t.disputed} disputed` : null, t.notAired ? `${t.notAired} not aired` : null, t.refunded ? `${formatMoney(t.refunded)} refunded to your wallet` : null].filter(Boolean).join(" · ")}
                </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[560px] text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr><th className="px-3 py-2 font-medium">Media house</th><th className="px-2 py-2 text-right font-medium">Aired</th><th className="px-2 py-2 text-right font-medium">Upcoming</th><th className="px-2 py-2 font-medium">Next</th><th className="px-2 py-2 text-right font-medium">Held</th><th className="px-3 py-2 text-right font-medium">Spent</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {state.data.stations.map((s) => (
                            <tr key={String(s.station._id)} className="text-slate-700 dark:text-slate-200">
                                <td className="px-3 py-2">{s.station.name || "Media house"}</td>
                                <td className="px-2 py-2 text-right">{s.aired}/{s.planned}</td>
                                <td className="px-2 py-2 text-right">{s.upcoming}</td>
                                <td className="px-2 py-2">{s.nextDate ? formatDate(s.nextDate) : "—"}</td>
                                <td className="px-2 py-2 text-right text-amber-600 dark:text-amber-400">{formatMoney(s.held)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatMoney(s.spent)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
