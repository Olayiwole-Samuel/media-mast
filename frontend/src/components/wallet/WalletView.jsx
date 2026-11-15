"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Wallet as WalletIcon, Plus, Loader2, FlaskConical, ArrowDownLeft, ArrowUpRight, Undo2, SlidersHorizontal,
    BellRing, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { fundWallet, getWalletTransactions, updateWalletSettings } from "@/lib/api";
import { useWallet, walletChanged } from "@/lib/wallet";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { formatMoney } from "@/lib/status";
import { PageLoading, PageError } from "@/components/common/PageState";

// The advertiser's wallet: fund it any time, every booking is paid from it,
// refunds come back to it. Funding is in test mode until Paystack is connected.

const QUICK = [100000, 500000, 1000000, 5000000];
const FILTERS = [
    { value: "", label: "All" },
    { value: "FUND", label: "Top-ups" },
    { value: "CHARGE", label: "Bookings" },
    { value: "REFUND", label: "Refunds" },
    { value: "ADJUSTMENT", label: "Adjustments" },
];
const TYPE = {
    FUND: { label: "Wallet top-up", icon: ArrowDownLeft, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400", sign: "+" },
    CHARGE: { label: "Booking", icon: ArrowUpRight, tone: "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-200", sign: "−" },
    REFUND: { label: "Refund", icon: Undo2, tone: "text-sky-600 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-400", sign: "+" },
    ADJUSTMENT: { label: "Adjustment", icon: SlidersHorizontal, tone: "text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400", sign: "" },
};

const inputClass = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const digits = (v) => String(v || "").replace(/[^\d.]/g, "");
const when = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Stat({ label, value, hint, strong }) {
    return (
        <div className={`rounded-2xl border p-5 ${strong ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-1 font-bold text-slate-900 dark:text-white ${strong ? "text-3xl" : "text-xl"}`}>{value}</p>
            {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
    );
}

export default function WalletView() {
    const params = useSearchParams();
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const { loading, error, data, wallet, reload } = useWallet();

    const [amount, setAmount] = useState(() => digits(params.get("fund")));
    const [funding, setFunding] = useState(false);
    const [notice, setNotice] = useState(null);
    const [threshold, setThreshold] = useState("");
    const [savingAlert, setSavingAlert] = useState(false);

    const [filter, setFilter] = useState("");
    const [history, setHistory] = useState({ items: [], page: 1, pages: 1, loading: true });

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (wallet) setThreshold(wallet.lowBalanceThreshold ? String(wallet.lowBalanceThreshold) : "");
    }, [wallet]);

    const loadHistory = async (page = 1, type = filter) => {
        setHistory((h) => ({ ...h, loading: true }));
        try {
            const res = await getWalletTransactions({ page, type });
            setHistory((h) => ({ items: page === 1 ? res.data || [] : [...h.items, ...(res.data || [])], page, pages: res.pagination?.pages || 1, loading: false }));
        } catch {
            setHistory((h) => ({ ...h, loading: false }));
        }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadHistory(1, filter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, wallet?.balance]);

    if (loading && !data) return <PageLoading label="Loading your wallet…" />;
    if (error && !data) return <PageError title="We couldn't load your wallet" message={error.message} onRetry={reload} />;

    const currency = wallet?.currency || "NGN";
    const min = data?.funding?.min || 1000;
    const testMode = data?.funding?.testMode !== false;
    const byCampaign = data?.byCampaign || [];

    const handleFund = async (e) => {
        e.preventDefault();
        setNotice(null);
        const value = Number(digits(amount));
        if (!(value >= min)) return setNotice({ type: "error", text: `Enter at least ${formatMoney(min, currency)}.` });
        setFunding(true);
        try {
            const res = await fundWallet(value);
            setNotice({ type: "success", text: res?.message || "Wallet funded." });
            setAmount("");
            walletChanged();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't fund your wallet." });
        } finally {
            setFunding(false);
        }
    };

    const handleAlert = async (e) => {
        e.preventDefault();
        setSavingAlert(true);
        setNotice(null);
        try {
            const res = await updateWalletSettings({ lowBalanceThreshold: Number(digits(threshold)) || 0 });
            setNotice({ type: "success", text: res?.message || "Saved." });
            walletChanged();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't save the alert." });
        } finally {
            setSavingAlert(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <WalletIcon className="h-6 w-6 text-emerald-500" /> Wallet
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Fund your wallet any time. Every booking is paid from it, and refunds come straight back to it.
                </p>
            </div>

            {testMode && (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    <FlaskConical className="h-5 w-5 shrink-0" />
                    <p><span className="font-semibold">Test mode.</span> Top-ups are added instantly and no real money moves. Card and bank payments (Paystack) will be connected before launch.</p>
                </div>
            )}

            {wallet?.isLow && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>Your balance is below your {formatMoney(wallet.lowBalanceThreshold, currency)} alert. Fund your wallet so your next bookings go through.</p>
                </div>
            )}

            {notice && (
                <div role={notice.type === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${notice.type === "error" ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"}`}>
                    {notice.type === "success" && <CheckCircle2 className="h-4 w-4" />} {notice.text}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat strong label="Balance" value={formatMoney(wallet?.balance || 0, currency)} hint="Available to book" />
                <Stat label="Total funded" value={formatMoney(wallet?.totalFunded || 0, currency)} hint="All top-ups" />
                <Stat label="Total spent" value={formatMoney(wallet?.totalSpent || 0, currency)} hint="Bookings paid from the wallet" />
                <Stat label="Refunded" value={formatMoney(wallet?.totalRefunded || 0, currency)} hint="Declined or cancelled spots" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <form onSubmit={handleFund} className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Fund your wallet</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add enough for the campaigns you plan to book. You can top up again any time.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {QUICK.map((q) => (
                            <button key={q} type="button" onClick={() => setAmount(String(q))}
                                className={`rounded-full border px-3 py-1.5 text-sm ${Number(digits(amount)) === q ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300"}`}>
                                {formatMoney(q, currency)}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <label className="flex-1">
                            <span className="sr-only">Amount</span>
                            <input inputMode="numeric" value={amount ? Number(digits(amount)).toLocaleString("en-NG") : ""} onChange={(e) => setAmount(digits(e.target.value))} placeholder={`Amount (min ${formatMoney(min, currency)})`} className={inputClass} />
                        </label>
                        <button type="submit" disabled={funding} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                            {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {amount ? `Add ${formatMoney(Number(digits(amount)), currency)}` : "Add money"}{testMode ? " (test)" : ""}
                        </button>
                    </div>
                </form>

                <form onSubmit={handleAlert} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><BellRing className="h-4 w-4 text-amber-500" /> Low-balance alert</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">We&apos;ll email you and show an alert when your balance drops below this.</p>
                    <input inputMode="numeric" value={threshold ? Number(digits(threshold)).toLocaleString("en-NG") : ""} onChange={(e) => setThreshold(digits(e.target.value))} placeholder="e.g. 200,000 (empty = off)" className={`${inputClass} mt-4`} />
                    <button type="submit" disabled={savingAlert} className="mt-3 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        {savingAlert ? "Saving…" : "Save alert"}
                    </button>
                </form>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Spend by campaign</h2>
                    <Link href={paths.book} className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Book airtime</Link>
                </div>
                {byCampaign.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">No bookings paid from the wallet yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-sm">
                            <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
                                <tr><th className="px-5 py-2 font-medium">Campaign</th><th className="px-3 py-2 text-right font-medium">Spent</th><th className="px-3 py-2 text-right font-medium">Refunded</th><th className="px-5 py-2 text-right font-medium">Net</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {byCampaign.map((c) => (
                                    <tr key={String(c.campaignId)}>
                                        <td className="px-5 py-2.5 text-slate-800 dark:text-slate-100">{c.campaignName}</td>
                                        <td className="px-3 py-2.5 text-right">{formatMoney(c.spent, currency)}</td>
                                        <td className="px-3 py-2.5 text-right text-sky-600 dark:text-sky-400">{c.refunded ? formatMoney(c.refunded, currency) : "—"}</td>
                                        <td className="px-5 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(c.net, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <h2 className="font-semibold text-slate-900 dark:text-white">History</h2>
                    <div className="flex flex-wrap gap-1.5">
                        {FILTERS.map((f) => (
                            <button key={f.value} type="button" onClick={() => setFilter(f.value)}
                                className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.value ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                {history.items.length === 0 && !history.loading ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing here yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {history.items.map((t) => {
                            const meta = TYPE[t.type] || TYPE.ADJUSTMENT;
                            const Icon = meta.icon;
                            const sign = meta.sign || (t.amount >= 0 ? "+" : "−");
                            return (
                                <li key={t._id} className="flex items-center gap-3 px-5 py-3">
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tone}`}><Icon className="h-4 w-4" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                            {meta.label}{t.campaignName ? ` · ${t.campaignName}` : ""}
                                        </p>
                                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{when(t.createdAt)}{t.note ? ` · ${t.note}` : ""}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-semibold ${sign === "+" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>{sign}{formatMoney(Math.abs(t.amount), t.currency)}</p>
                                        <p className="text-xs text-slate-400">Balance {formatMoney(t.balanceAfter, t.currency)}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {history.loading && <p className="px-5 py-4 text-center text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</p>}
                {!history.loading && history.page < history.pages && (
                    <div className="border-t border-slate-100 px-5 py-3 text-center dark:border-slate-800">
                        <button type="button" onClick={() => loadHistory(history.page + 1)} className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Show more</button>
                    </div>
                )}
            </section>
        </div>
    );
}
