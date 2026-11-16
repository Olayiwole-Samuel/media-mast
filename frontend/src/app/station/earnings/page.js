"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Landmark, Send, CheckCircle2 } from "lucide-react";
import { getStationEarnings, setStationPayoutAccount, requestStationPayout } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// A media house's money. "Expected" is booked spots not yet paid (the
// advertiser's money is held until the spot airs); "Earned" is aired spots,
// after VAT and any commission, available to pay out to the bank.

const TX_LABEL = { EARNING: "Spot aired: earned", PAYOUT: "Payout requested", PAYOUT_REVERSED: "Payout declined: returned" };
const PAYOUT_TONE = { PENDING: "text-amber-600", PAID: "text-emerald-600", DECLINED: "text-red-600" };
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function StationMoney({ entry, settings, onChanged }) {
    const [account, setAccount] = useState(entry.payoutAccount?.accountNumber ? entry.payoutAccount : { bankName: "", accountNumber: "", accountName: "" });
    const [editing, setEditing] = useState(!entry.payoutAccount?.accountNumber);
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const pending = entry.payouts.find((p) => p.status === "PENDING");

    const saveAccount = async (e) => {
        e.preventDefault();
        setBusy(true); setMessage(null);
        try {
            await setStationPayoutAccount(entry.station._id, account);
            setEditing(false);
            setMessage({ type: "success", text: "Bank account saved." });
            onChanged();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't save the account." });
        } finally { setBusy(false); }
    };

    const payout = async (e) => {
        e.preventDefault();
        setBusy(true); setMessage(null);
        try {
            const res = await requestStationPayout(entry.station._id, Number(String(amount).replace(/[^\d.]/g, "")));
            setAmount("");
            setMessage({ type: "success", text: res?.message || "Payout requested." });
            onChanged();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't request the payout." });
        } finally { setBusy(false); }
    };

    return (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{entry.station.name}</h2>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    ["Expected", entry.expected, "Booked spots, paid once they air"],
                    ["Awaiting advertiser check", entry.awaitingRelease, `Aired or disputed (${settings.disputeHours}h window)`],
                    ["Earned (available)", entry.earned, "Ready to pay out"],
                    ["Paid out", entry.totalPaidOut, `Earned in total ${formatMoney(entry.totalEarned, "NGN")}`],
                ].map(([label, value, hint], i) => (
                    <div key={label} className={`rounded-xl border p-4 ${i === 2 ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-slate-200 dark:border-slate-800"}`}>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatMoney(value || 0, "NGN")}</p>
                        <p className="mt-1 text-xs text-slate-400">{hint}</p>
                    </div>
                ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Figures are after VAT{settings.commissionPercent ? ` and the ${settings.commissionPercent}% Media Masters commission` : ""}. Mark each spot aired with its TX log and clip on Booking requests to be paid.
            </p>

            <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Booked spots by programme</h3>
                {entry.byProgramme.length === 0 ? (
                    <p className="text-sm text-slate-500">No booked spots waiting.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full min-w-[520px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                <tr><th className="px-4 py-2 font-medium">Day</th><th className="px-3 py-2 font-medium">Programme / belt</th><th className="px-3 py-2 text-right font-medium">Spots</th><th className="px-3 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Expected</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {entry.byProgramme.map((g) => (
                                    <tr key={`${g.date}-${g.programme}-${g.time}`}>
                                        <td className="px-4 py-2 whitespace-nowrap">{formatDate(g.date)}</td>
                                        <td className="px-3 py-2">{g.programme}{g.time ? <span className="text-slate-400"> · {g.time}</span> : null}</td>
                                        <td className="px-3 py-2 text-right">{g.spots}</td>
                                        <td className="px-3 py-2 text-xs text-slate-500">{[g.aired ? `${g.aired} aired, awaiting check` : null, g.disputed ? `${g.disputed} disputed` : null].filter(Boolean).join(" · ") || "Booked"}</td>
                                        <td className="px-4 py-2 text-right font-semibold">{formatMoney(g.expected, "NGN")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {message && <p role={message.type === "error" ? "alert" : "status"} className={`flex items-center gap-1.5 text-sm ${message.type === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}`}>{message.type === "success" && <CheckCircle2 className="h-4 w-4" />}{message.text}</p>}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Landmark className="h-4 w-4 text-emerald-600" /> Bank account for payouts</h3>
                    {editing ? (
                        <form onSubmit={saveAccount} className="space-y-2">
                            <input value={account.bankName} onChange={(e) => setAccount({ ...account, bankName: e.target.value })} placeholder="Bank (e.g. GTBank)" className={inputClass} required />
                            <input value={account.accountNumber} onChange={(e) => setAccount({ ...account, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit account number" inputMode="numeric" className={inputClass} required />
                            <input value={account.accountName} onChange={(e) => setAccount({ ...account, accountName: e.target.value })} placeholder="Account name" className={inputClass} required />
                            <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">Save account</button>
                        </form>
                    ) : (
                        <div className="text-sm text-slate-700 dark:text-slate-200">
                            <p>{account.bankName} · {account.accountNumber}</p>
                            <p className="text-slate-500">{account.accountName}</p>
                            <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-medium text-emerald-600 hover:underline">Change</button>
                        </div>
                    )}
                </div>

                <form onSubmit={payout} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Send className="h-4 w-4 text-emerald-600" /> Request a payout</h3>
                    {pending ? (
                        <p className="text-sm text-amber-700 dark:text-amber-300">{formatMoney(pending.amount, "NGN")} requested on {formatDate(pending.createdAt)}: waiting for Media Masters to transfer it.</p>
                    ) : (
                        <>
                            <p className="mb-2 text-xs text-slate-500">Up to {formatMoney(entry.earned, "NGN")}. Media Masters transfers it to your bank and sends you the reference.</p>
                            <div className="flex gap-2">
                                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="numeric" className={inputClass} />
                                <button type="button" onClick={() => setAmount(String(entry.earned))} className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700">All</button>
                            </div>
                            <button type="submit" disabled={busy || editing || !(entry.earned > 0)} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request payout
                            </button>
                        </>
                    )}
                </form>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Earnings history</h3>
                    {entry.history.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                            {entry.history.map((t) => (
                                <li key={t._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <div className="min-w-0"><p className="truncate text-slate-800 dark:text-slate-100">{TX_LABEL[t.type] || t.type}</p><p className="truncate text-xs text-slate-500">{formatDate(t.createdAt)}{t.note ? ` · ${t.note}` : ""}</p></div>
                                    <span className={t.type === "PAYOUT" ? "text-slate-700 dark:text-slate-200" : "font-semibold text-emerald-600"}>{t.type === "PAYOUT" ? "−" : "+"}{formatMoney(t.amount, "NGN")}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Payouts</h3>
                    {entry.payouts.length === 0 ? <p className="text-sm text-slate-500">No payouts yet.</p> : (
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                            {entry.payouts.map((p) => (
                                <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <div className="min-w-0"><p className="text-slate-800 dark:text-slate-100">{formatMoney(p.amount, "NGN")}</p><p className="truncate text-xs text-slate-500">{formatDate(p.createdAt)}{p.reference ? ` · ref ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</p></div>
                                    <span className={`text-xs font-semibold ${PAYOUT_TONE[p.status]}`}>{p.status === "PENDING" ? "Waiting" : p.status === "PAID" ? "Paid" : "Declined"}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

export default function StationEarningsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [], settings: {} });

    const load = useCallback(async () => {
        try {
            const res = await getStationEarnings();
            setState({ loading: false, error: null, data: res.data || [], settings: res.settings || {} });
        } catch (error) {
            setState((s) => ({ ...s, loading: false, error }));
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (state.loading) return <PageLoading label="Loading your earnings…" />;
    if (state.error) return <ApiErrorState error={state.error} onRetry={load} />;

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Coins className="h-6 w-6 text-emerald-500" /> Earnings</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">The advertiser&apos;s money is held until each spot airs. Once you mark it aired with the TX log and clip, and their check window passes, it&apos;s yours to pay out.</p>
            </div>
            {state.data.length === 0 ? (
                <EmptyState icon={Coins} title="No media house yet" message="Earnings appear here for the media houses you manage." />
            ) : state.data.map((entry) => (
                <StationMoney key={entry.station._id} entry={entry} settings={state.settings} onChanged={load} />
            ))}
        </div>
    );
}
