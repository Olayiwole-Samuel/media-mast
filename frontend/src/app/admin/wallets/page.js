"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet as WalletIcon, X, Loader2, Search } from "lucide-react";
import { getAdminWallets, getAdminWalletTransactions, adjustAdminWallet, getPaystackTopUps, checkPaystackTopUp } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Every advertiser wallet: balances, history, and manual adjustments
// (e.g. crediting a bank transfer the advertiser made, or a correction).

const TYPE_LABEL = { FUND: "Top-up", CHARGE: "Booking", REFUND: "Refund", ADJUSTMENT: "Adjustment" };
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const TOPUP = {
    PENDING: ["Not paid yet", "text-amber-300"], PAID: ["Paid", "text-emerald-400"], FAILED: ["Failed", "text-slate-400"], MISMATCH: ["Needs checking", "text-red-400"],
};

// Paystack top-ups, newest first: for "I paid but it isn't in my wallet".
function TopUps({ onChanged }) {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState("");
    const [message, setMessage] = useState("");
    const load = useCallback(() => getPaystackTopUps().then((r) => setRows(r.data || [])).catch(() => setRows([])), []);
    useEffect(() => { load(); }, [load]);
    if (!rows || rows.length === 0) return null;

    const check = async (reference) => {
        setBusy(reference); setMessage("");
        try {
            const res = await checkPaystackTopUp(reference);
            setMessage(`${reference}: ${res.message}`);
            await load();
            onChanged();
        } catch (err) {
            setMessage(err?.message || "Couldn't reach Paystack.");
        } finally { setBusy(""); }
    };

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Paystack top-ups</h2>
            {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-white/5 text-xs text-slate-400">
                        <tr><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3" /></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {rows.map((t) => (
                            <tr key={t._id} className="text-slate-200">
                                <td className="whitespace-nowrap px-4 py-3">{new Date(t.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                                <td className="px-4 py-3">{t.owner || "—"}</td>
                                <td className="px-4 py-3 text-right font-semibold">{formatMoney(t.amount, t.currency)}</td>
                                <td className="px-4 py-3"><span className={`font-medium ${TOPUP[t.status]?.[1] || ""}`}>{TOPUP[t.status]?.[0] || t.status}</span>{t.mode === "TEST" ? <span className="ml-2 text-xs text-amber-200">test</span> : null}{t.message && t.status !== "PAID" ? <p className="text-xs text-slate-500">{t.message}</p> : null}</td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.reference}</td>
                                <td className="px-4 py-3 text-right">
                                    {["PENDING", "FAILED"].includes(t.status) && (
                                        <button type="button" disabled={!!busy} onClick={() => check(t.reference)} className="text-xs font-medium text-emerald-400 hover:underline disabled:opacity-50">{busy === t.reference ? "Checking…" : "Check again"}</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function AdminWalletsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [], totals: null });
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(null); // wallet
    const [history, setHistory] = useState(null);
    const [form, setForm] = useState({ amount: "", note: "" });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await getAdminWallets();
            setState({ loading: false, error: null, data: res.data || [], totals: res.totals || null });
        } catch (error) {
            setState((s) => ({ ...s, loading: false, error }));
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const show = async (w) => {
        setOpen(w);
        setHistory(null);
        setForm({ amount: "", note: "" });
        setMessage(null);
        try {
            const res = await getAdminWalletTransactions(w._id);
            setHistory(res.data || []);
        } catch {
            setHistory([]);
        }
    };

    const adjust = async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const res = await adjustAdminWallet(open._id, { amount: Number(String(form.amount).replace(/[^\d.-]/g, "")), note: form.note });
            setMessage({ type: "success", text: "Wallet adjusted." });
            setOpen((o) => ({ ...o, ...res.data.wallet }));
            setForm({ amount: "", note: "" });
            await load();
            const h = await getAdminWalletTransactions(open._id);
            setHistory(h.data || []);
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't adjust the wallet." });
        } finally {
            setBusy(false);
        }
    };

    if (state.loading) return <PageLoading label="Loading wallets…" />;
    if (state.error) return <ApiErrorState error={state.error} onRetry={load} />;

    const q = query.trim().toLowerCase();
    const rows = state.data.filter((w) => !q || [w.owner.name, w.owner.email].filter(Boolean).join(" ").toLowerCase().includes(q));
    const t = state.totals || {};

    return (
        <div className="min-h-screen space-y-6 bg-slate-950 p-4 text-white sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><WalletIcon className="h-6 w-6 text-emerald-400" /> Wallets</h1>
                <p className="mt-1 text-slate-400">Advertisers fund their wallet and every booking is paid from it. Top-ups come through Paystack; credit bank transfers made straight to the company account here.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[["Held in wallets", t.balance], ["Total funded", t.funded], ["Spent on bookings", t.spent], ["Refunded to wallets", t.refunded]].map(([label, v]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="mt-1 text-xl font-semibold text-white">{formatMoney(v || 0, "NGN")}</p>
                    </div>
                ))}
            </div>

            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by company or person" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
            </div>

            {rows.length === 0 ? (
                <EmptyState icon={WalletIcon} title="No wallets yet" message="A wallet appears when an advertiser opens it or funds it." />
            ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-white/5 text-xs text-slate-400">
                            <tr><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 text-right font-medium">Balance</th><th className="px-4 py-3 text-right font-medium">Funded</th><th className="px-4 py-3 text-right font-medium">Spent</th><th className="px-4 py-3 text-right font-medium">Refunded</th><th className="px-4 py-3" /></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rows.map((w) => (
                                <tr key={w._id} className="text-slate-200">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-white">{w.owner.name}</p>
                                        <p className="text-xs text-slate-500">{w.owner.kind === "COMPANY" ? (w.owner.companyType === "AGENCY" ? "Media agency" : "Media client") : w.owner.email || "Individual"}{w.isLow ? " · low balance" : ""}</p>
                                    </td>
                                    <td className={`px-4 py-3 text-right font-semibold ${w.isLow ? "text-red-400" : "text-emerald-300"}`}>{formatMoney(w.balance, w.currency)}</td>
                                    <td className="px-4 py-3 text-right">{formatMoney(w.totalFunded, w.currency)}</td>
                                    <td className="px-4 py-3 text-right">{formatMoney(w.totalSpent, w.currency)}</td>
                                    <td className="px-4 py-3 text-right">{formatMoney(w.totalRefunded, w.currency)}</td>
                                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => show(w)} className="text-xs font-medium text-emerald-400 hover:underline">Open</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <TopUps onChanged={load} />

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
                    <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-white">{open.owner.name}</h2>
                                <p className="text-sm text-slate-400">Balance {formatMoney(open.balance, open.currency)}</p>
                            </div>
                            <button type="button" onClick={() => setOpen(null)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button>
                        </div>

                        <form onSubmit={adjust} className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-[1fr_2fr_auto]">
                            <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount (− to remove)" className={inputClass} required />
                            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note, e.g. bank transfer reference" className={inputClass} required maxLength={300} />
                            <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Adjust
                            </button>
                            {message && <p className={`text-sm sm:col-span-3 ${message.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{message.text}</p>}
                        </form>

                        <h3 className="mb-2 text-xs uppercase tracking-wider text-slate-500">History</h3>
                        {history === null ? (
                            <p className="text-sm text-slate-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</p>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-slate-400">No movements yet.</p>
                        ) : (
                            <ul className="divide-y divide-white/5">
                                {history.map((h) => (
                                    <li key={h._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                        <div className="min-w-0">
                                            <p className="truncate text-white">{TYPE_LABEL[h.type] || h.type}{h.campaignName ? ` · ${h.campaignName}` : ""}</p>
                                            <p className="truncate text-xs text-slate-500">{new Date(h.createdAt).toLocaleString("en-GB")}{h.note ? ` · ${h.note}` : ""}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={h.type === "CHARGE" || h.amount < 0 ? "text-slate-200" : "text-emerald-400"}>{h.type === "CHARGE" || h.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(h.amount), h.currency)}</p>
                                            <p className="text-xs text-slate-500">→ {formatMoney(h.balanceAfter, h.currency)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
