"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3, Wallet, Percent, Receipt, RotateCcw, Building2, Megaphone, Radio, ShieldCheck, Film, RefreshCw } from "lucide-react";
import { getAdminAnalytics } from "@/lib/api";
import { formatMoney, bookingStatus } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Platform analytics from real records only: money (spot value, discounts,
// VAT, refunds), the last six months, what sells (media type, spot length,
// top media houses), the business mix and approvals, and adverts.

const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const TYPE_LABEL = { TV: "Television", RADIO: "Radio", PRESS: "Press", BILLBOARD: "Billboard", DIGITAL: "Digital", OTHER: "Other" };
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "short", year: "2-digit", timeZone: "UTC" });

function Bar({ label, value, max, right }) {
    const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return (
        <div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="truncate">{label}</span>
                <span className="ml-2 shrink-0 font-medium text-slate-900 dark:text-white">{right}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function Stat({ label, value, hint, icon: Icon }) {
    return (
        <div className={card}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
                </div>
                <Icon className="h-5 w-5 shrink-0 text-emerald-500" />
            </div>
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await getAdminAnalytics();
            setData(res.data);
        } catch (err) {
            setError(err);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="analytics" onRetry={load} /></div>;
    if (!data) return <PageLoading label="Loading analytics…" />;

    const { money, months, bookingsByType, bookingsByLength, bookingsByStatus, topStations, businesses, approvals, adverts } = data;
    const maxMonthMoney = Math.max(0, ...months.map((m) => m.collected));
    const maxMonthBookings = Math.max(0, ...months.map((m) => m.bookings));
    const maxType = Math.max(0, ...bookingsByType.map((t) => t.value));
    const maxLength = Math.max(0, ...bookingsByLength.map((l) => l.count));
    const maxStation = Math.max(0, ...topStations.map((s) => s.value));
    const totalAdverts = adverts.reduce((t, a) => t + a.count, 0);
    const advertsWithArcon = adverts.reduce((t, a) => t + a.withArcon, 0);

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <BarChart3 className="h-6 w-6 text-emerald-500" /> Platform analytics
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">From real bookings and payments only — no estimates. Payments are in test mode until Paystack goes live.</p>
                </div>
                <button type="button" onClick={load} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <RefreshCw className="h-4 w-4" /> Refresh
                </button>
            </motion.div>

            {/* Money */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Collected" value={formatMoney(money.collected)} hint={`${money.checkouts} checkout${money.checkouts === 1 ? "" : "s"}, incl. VAT`} icon={Wallet} />
                <Stat label="Spot value (rate cards)" value={formatMoney(money.spotValue)} hint={`Discounts given: ${formatMoney(money.discounts)}`} icon={Percent} />
                <Stat label="VAT collected" value={formatMoney(money.vat)} hint="Owed to FIRS" icon={Receipt} />
                <Stat label="Refunds" value={formatMoney(money.refunds)} hint={`Net after refunds: ${formatMoney(money.net)}`} icon={RotateCcw} />
            </div>

            {/* Last six months */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className={card}>
                    <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Money collected per month</h2>
                    <div className="space-y-3">
                        {months.map((m) => <Bar key={m.month} label={monthLabel(m.month)} value={m.collected} max={maxMonthMoney} right={formatMoney(m.collected)} />)}
                    </div>
                </section>
                <section className={card}>
                    <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Spots booked per month</h2>
                    <div className="space-y-3">
                        {months.map((m) => <Bar key={m.month} label={monthLabel(m.month)} value={m.bookings} max={maxMonthBookings} right={m.bookings} />)}
                    </div>
                </section>
            </div>

            {/* What sells */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className={card}>
                    <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">By media type</h2>
                    {bookingsByType.length === 0 ? <p className="text-sm text-slate-500">No bookings yet.</p> : (
                        <div className="space-y-3">
                            {bookingsByType.map((t) => <Bar key={t.type} label={`${TYPE_LABEL[t.type] || t.type} · ${t.count} spots`} value={t.value} max={maxType} right={formatMoney(t.value)} />)}
                        </div>
                    )}
                </section>
                <section className={card}>
                    <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">By spot length</h2>
                    {bookingsByLength.length === 0 ? <p className="text-sm text-slate-500">No bookings yet.</p> : (
                        <div className="space-y-3">
                            {bookingsByLength.map((l) => <Bar key={String(l.seconds)} label={l.seconds ? `${l.seconds}-second spots` : "Older bookings (no length)"} value={l.count} max={maxLength} right={`${l.count} · ${formatMoney(l.value)}`} />)}
                        </div>
                    )}
                </section>
                <section className={card}>
                    <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Top media houses</h2>
                    {topStations.length === 0 ? <p className="text-sm text-slate-500">No bookings yet.</p> : (
                        <div className="space-y-3">
                            {topStations.map((s) => <Bar key={s.name} label={`${s.name} · ${s.count} spots`} value={s.value} max={maxStation} right={formatMoney(s.value)} />)}
                        </div>
                    )}
                </section>
            </div>

            {/* Bookings by status */}
            <section className={card}>
                <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Bookings by status</h2>
                <div className="flex flex-wrap gap-2">
                    {bookingsByStatus.length === 0 ? <p className="text-sm text-slate-500">No bookings yet.</p> : bookingsByStatus.map((b) => {
                        const badge = bookingStatus(b.status);
                        return <span key={b.status} className={`rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}>{badge.label}: {b.count}</span>;
                    })}
                </div>
            </section>

            {/* Businesses, approvals, adverts */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Stat label="Media clients" value={businesses.mediaClients} icon={Building2} />
                <Stat label="Media agencies" value={businesses.mediaAgencies} icon={Megaphone} />
                <Stat label="Live media houses" value={businesses.liveMediaHouses} icon={Radio} />
                <Link href="/admin/verifications" className="block">
                    <Stat label="Approvals" value={approvals.SUBMITTED || 0} hint={`waiting · ${approvals.APPROVED || 0} approved · ${approvals.REJECTED || 0} sent back`} icon={ShieldCheck} />
                </Link>
                <Stat label="Adverts" value={totalAdverts} hint={`${advertsWithArcon} with an ARCON certificate`} icon={Film} />
            </div>
        </div>
    );
}
