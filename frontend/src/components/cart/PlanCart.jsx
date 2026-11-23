"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Wallet as WalletIcon, Pencil, Trash2, CheckCircle2, AlertTriangle, CalendarRange, Link2, FileSpreadsheet, MessageSquare, Clock3 } from "lucide-react";
import { getPlanDrafts, checkoutPlanDraft, deletePlanDraft, sharePlanDraft, saveProtectedFile, draftPlanXlsxPath } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { walletChanged } from "@/lib/wallet";
import { announceDataChanged } from "@/lib/events";

// Media plans waiting in the cart (saved as they were built). Shows what
// each costs, what the wallet holds and what's missing; fund the wallet and
// come straight back; pay a plan from the wallet.

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const perDay = (spotsByDay) => DAYS.filter(([d]) => (spotsByDay || [])[d] > 0).map(([d, l]) => `${l} ${spotsByDay[d]}`).join(", ");
const prettyDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default function PlanCart({ paths, onCount }) {
    const [state, setState] = useState({ loading: true, error: "", data: null });
    const [busy, setBusy] = useState(null);
    const [message, setMessage] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await getPlanDrafts();
            setState({ loading: false, error: "", data: res?.data || null });
            onCount?.((res?.data?.drafts || []).length);
        } catch (err) {
            setState({ loading: false, error: err?.message || "Couldn't load your plans.", data: null });
        }
    }, [onCount]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (state.loading) return <p className="text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading your plans…</p>;
    if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
    const drafts = state.data?.drafts || [];
    if (!drafts.length) return message ? <SuccessNote message={message} paths={paths} /> : null;
    const balance = state.data.wallet.balance;

    const pay = async (d) => {
        setBusy(d.campaign._id); setMessage(null);
        try {
            const res = await checkoutPlanDraft(d.campaign._id);
            walletChanged();
            announceDataChanged();
            setMessage({ type: "success", text: res?.message || "Plan booked." });
            await load();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "The plan could not be booked. You have not been charged." });
            await load();
        } finally { setBusy(null); }
    };
    const share = async (d) => {
        setBusy(d.campaign._id); setMessage(null);
        try {
            const res = await sharePlanDraft(d.campaign._id);
            const url = `${window.location.origin}${res.data.path}`;
            try { await navigator.clipboard.writeText(url); setMessage({ type: "success", text: `Review link copied. Send it to your client: ${url}` }); }
            catch { setMessage({ type: "success", text: `Send this link to your client: ${url}` }); }
            await load();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't create the link." });
        } finally { setBusy(null); }
    };
    const remove = async (d) => {
        setBusy(d.campaign._id);
        try { await deletePlanDraft(d.campaign._id); await load(); } finally { setBusy(null); }
    };

    return (
        <div className="space-y-4">
            {message && <SuccessNote message={message} paths={paths} />}
            <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${state.data.wallet.shortfall > 0 ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10" : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"}`}>
                <div className="text-sm">
                    <p className="font-semibold text-slate-900 dark:text-white">Needed for {drafts.length} plan{drafts.length === 1 ? "" : "s"}: {formatMoney(state.data.needed)}</p>
                    <p className="text-slate-600 dark:text-slate-300">
                        Wallet {formatMoney(balance)}
                        {state.data.wallet.shortfall > 0 ? <span className="font-semibold text-red-600 dark:text-red-400"> · {formatMoney(state.data.wallet.shortfall)} short</span> : " · enough for everything here"}
                    </p>
                </div>
                <Link href={`${paths.wallet}?${state.data.wallet.shortfall > 0 ? `fund=${Math.ceil(state.data.wallet.shortfall)}&` : ""}back=${encodeURIComponent(paths.cart)}`}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${state.data.wallet.shortfall > 0 ? "bg-red-500 text-white hover:bg-red-600" : "border border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200"}`}>
                    <WalletIcon className="h-4 w-4" /> Fund wallet
                </Link>
            </div>

            {drafts.map((d) => {
                const totals = d.quote?.totals;
                const errors = d.quote?.errors || [];
                const short = totals ? Math.max(0, totals.total - balance) : 0;
                return (
                    <section key={d._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                            <div>
                                <p className="font-semibold text-slate-900 dark:text-white">{d.campaign.name}</p>
                                <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarRange className="h-3.5 w-3.5" /> {prettyDate(d.campaign.startDate)} to {prettyDate(d.campaign.endDate || d.campaign.startDate)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={busy === d.campaign._id} onClick={() => share(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><Link2 className="h-3.5 w-3.5" /> {d.share ? "Copy client link" : "Send to client"}</button>
                                <button type="button" onClick={() => saveProtectedFile(draftPlanXlsxPath(d.campaign._id), `${d.campaign.name}-media-plan.xlsx`).catch(() => {})} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
                                <Link href={`${paths.book}?campaign=${d.campaign._id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><Pencil className="h-3.5 w-3.5" /> Edit plan</Link>
                                <button type="button" disabled={busy === d.campaign._id} onClick={() => remove(d)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                            </div>
                        </div>
                        {d.share && (
                            <div className={`flex items-start gap-2 border-b px-4 py-2 text-sm ${d.share.changedSince ? "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200" : d.share.decision === "APPROVED" ? "border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200" : d.share.decision === "CHANGES_REQUESTED" ? "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200" : "border-slate-100 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"}`}>
                                {d.share.decision === "APPROVED" && !d.share.changedSince ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : d.share.decision === "CHANGES_REQUESTED" ? <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />}
                                <span>
                                    {d.share.changedSince ? `${d.share.name} approved an earlier version; you've changed the plan since. Send the link again.`
                                        : d.share.decision === "APPROVED" ? `Approved by ${d.share.name}.`
                                            : d.share.decision === "CHANGES_REQUESTED" ? `${d.share.name} asked for changes: "${d.share.comment}"`
                                                : "Sent to your client: waiting for their review."}
                                </span>
                            </div>
                        )}
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(d.quote?.lines || []).map((l) => (
                                <li key={l.index} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="truncate text-slate-800 dark:text-slate-100">{l.station.name} · {l.rate.name}{l.rate.spotSeconds ? ` · ${l.rate.spotSeconds}s` : ""}</p>
                                        <p className="text-xs text-slate-500">{perDay(l.spotsByDay)} · {l.spots} spots · {prettyDate(l.firstDate)} to {prettyDate(l.lastDate)}{l.unit.volumeDiscountPercent ? ` · ${l.unit.volumeDiscountPercent}% vol.` : ""}{l.volumeDiscountStatus === "PENDING" ? " · volume discount awaiting confirmation" : ""}</p>
                                    </div>
                                    <span className="shrink-0 font-medium text-slate-900 dark:text-white">{formatMoney(l.totals.total)}</span>
                                </li>
                            ))}
                        </ul>
                        {errors.length > 0 && (
                            <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                                {errors.map((e) => <p key={`${e.line}-${e.message}`}>{e.line == null ? e.message : `Line ${e.line + 1}: ${e.message}`}</p>)}
                                <Link href={`${paths.book}?campaign=${d.campaign._id}`} className="font-medium underline">Fix it in the plan</Link>
                            </div>
                        )}
                        {totals && (
                            <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>{totals.spots.toLocaleString()} spots · rate card</span><span>{formatMoney(totals.gross)}</span></div>
                                {totals.volumeDiscount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Volume discount</span><span>−{formatMoney(totals.volumeDiscount)}</span></div>}
                                {totals.agencyCommission > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Agency commission {totals.agencyCommissionPercent}%</span><span>−{formatMoney(totals.agencyCommission)}</span></div>}
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Net</span><span>{formatMoney(totals.net)}</span></div>
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>VAT {totals.vatPercent}%</span><span>{formatMoney(totals.vat)}</span></div>
                                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900 dark:border-slate-700 dark:text-white"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
                                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs text-slate-500">{short > 0 ? <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="h-3.5 w-3.5" /> Fund {formatMoney(short)} more to book this plan.</span> : "The total is held in your wallet and paid to each media house as its spots air."}</p>
                                    <button type="button" disabled={busy === d.campaign._id || short > 0 || errors.length > 0} onClick={() => pay(d)}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                                        {busy === d.campaign._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletIcon className="h-4 w-4" />} Pay {formatMoney(totals.total)} from wallet
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

function SuccessNote({ message, paths }) {
    return (
        <div role={message.type === "error" ? "alert" : "status"} className={`flex flex-col gap-2 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${message.type === "error" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"}`}>
            <p className="flex items-start gap-2">{message.type !== "error" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}{message.text}</p>
            {message.type !== "error" && <Link href={paths.campaigns} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">Track the campaign</Link>}
        </div>
    );
}
