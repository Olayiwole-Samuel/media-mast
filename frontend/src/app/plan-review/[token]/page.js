"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, MessageSquare, CalendarRange } from "lucide-react";
import { getSharedPlan, respondSharedPlan } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// A client reviewing the media plan their agency shared (no account needed):
// the lines, prices and total; approve it or ask for changes.

const prettyDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default function PlanReviewPage() {
    const { token } = useParams();
    const [state, setState] = useState({ loading: true, error: "", data: null });
    const [name, setName] = useState("");
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        getSharedPlan(token)
            .then((r) => setState({ loading: false, error: "", data: r.data }))
            .catch((e) => setState({ loading: false, error: e?.message || "This link is not available.", data: null }));
    }, [token]);

    const respond = async (decision) => {
        setBusy(true); setResult(null);
        try {
            const r = await respondSharedPlan(token, { name, decision, comment });
            setResult({ type: "success", text: r.message });
            setState((s) => ({ ...s, data: { ...s.data, status: r.data } }));
        } catch (e) {
            setResult({ type: "error", text: e?.message || "Couldn't send your response." });
        } finally { setBusy(false); }
    };

    if (state.loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
    if (state.error) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-slate-600">{state.error}</div>;
    const { agency, campaign, lines, totals, status } = state.data;

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
            <div className="mx-auto max-w-4xl space-y-6">
                <header>
                    <p className="text-sm font-medium text-emerald-600">Media plan from {agency}</p>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{campaign.name}{campaign.clientBrand ? ` · ${campaign.clientBrand}` : ""}</h1>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><CalendarRange className="h-4 w-4" /> {prettyDate(campaign.startDate)} to {prettyDate(campaign.endDate)}</p>
                </header>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
                            <tr><th className="px-4 py-2 font-medium">Media house</th><th className="px-3 py-2 font-medium">Programme</th><th className="px-3 py-2 font-medium">Days</th><th className="px-3 py-2 font-medium">Dates</th><th className="px-3 py-2 text-right font-medium">Spots</th><th className="px-3 py-2 text-right font-medium">Net rate</th><th className="px-4 py-2 text-right font-medium">Total</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {lines.map((l, i) => (
                                <tr key={i} className="text-slate-700 dark:text-slate-200">
                                    <td className="px-4 py-2">{l.station}</td>
                                    <td className="px-3 py-2">{l.programme}{l.spotSeconds ? ` · ${l.spotSeconds}s` : ""}{l.time ? <span className="block text-xs text-slate-400">{l.time}</span> : null}</td>
                                    <td className="px-3 py-2 text-xs">{l.days}</td>
                                    <td className="px-3 py-2 text-xs">{prettyDate(l.firstDate)} to {prettyDate(l.lastDate)}</td>
                                    <td className="px-3 py-2 text-right">{l.spots}</td>
                                    <td className="px-3 py-2 text-right">{formatMoney(l.unit.net)}</td>
                                    <td className="px-4 py-2 text-right font-medium">{formatMoney(l.totals.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <dl className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
                        <div className="flex justify-between text-slate-600"><dt>{totals.spots} spots · rate card</dt><dd>{formatMoney(totals.gross)}</dd></div>
                        {totals.savings > 0 && <div className="flex justify-between text-emerald-700"><dt>Discounts</dt><dd>−{formatMoney(totals.savings)}</dd></div>}
                        <div className="flex justify-between text-slate-600"><dt>VAT {totals.vatPercent}%</dt><dd>{formatMoney(totals.vat)}</dd></div>
                        <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-slate-900 dark:border-slate-800 dark:text-white"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
                    </dl>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    {status?.decision && status.decision !== "WAITING" && !status.changedSince ? (
                        <p className="mb-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            {status.decision === "APPROVED" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <MessageSquare className="h-5 w-5 text-amber-500" />}
                            {status.decision === "APPROVED" ? `Approved by ${status.name}` : `${status.name} asked for changes: "${status.comment}"`}
                        </p>
                    ) : status?.changedSince ? (
                        <p className="mb-4 text-sm text-amber-700">The plan has changed since it was last reviewed. Please review it again.</p>
                    ) : null}
                    <h2 className="font-semibold text-slate-900 dark:text-white">Your response</h2>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                        <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Comments (needed if you want changes)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    </div>
                    {result && <p className={`mt-3 text-sm ${result.type === "error" ? "text-red-600" : "text-emerald-700"}`}>{result.text}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" disabled={busy || !name.trim()} onClick={() => respond("APPROVE")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve plan
                        </button>
                        <button type="button" disabled={busy || !name.trim() || !comment.trim()} onClick={() => respond("CHANGES")} className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">Ask for changes</button>
                    </div>
                </section>
                <p className="text-center text-xs text-slate-400">Shared through Media Masters</p>
            </div>
        </div>
    );
}
