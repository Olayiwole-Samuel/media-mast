"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Radio, Megaphone, CalendarDays, ArrowRight, CalendarCheck, Wallet, Hourglass,
    ShoppingCart, Undo2, CheckCircle2, Clock, Plus,
} from "lucide-react";
import { getMe, getBookings, getCampaigns, getPayments } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { bookingStatus, campaignStatus, formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Individual dashboard: a summary of the advertiser's own activity, all from
// real endpoints (GET /auth/me, /bookings, /campaigns, /payments), plus the
// next spot due on air, bookings by status, recent bookings and campaigns.

// When a spot airs: date + time in Lagos (UTC+1), as the backend reads it.
const airTime = (b) => {
    if (!b?.date) return null;
    const d = new Date(b.date);
    const [h, m] = String(b.time || "00:00").split(":").map(Number);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 0, m || 0) - 60 * 60000);
};

const STATUS_ORDER = [
    { key: "PENDING", color: "bg-amber-400" },
    { key: "CHANGES_REQUESTED", color: "bg-orange-400" },
    { key: "ACCEPTED", color: "bg-emerald-400" },
    { key: "SCHEDULED", color: "bg-sky-400" },
    { key: "COMPLETED", color: "bg-emerald-600" },
    { key: "REJECTED", color: "bg-red-400" },
    { key: "CANCELLED", color: "bg-slate-400" },
];

const OPEN_CAMPAIGN = ["DRAFT", "SUBMITTED", "PAYMENT_PENDING", "PAYMENT_SUCCESSFUL", "BOOKING_REQUESTS_SENT", "MEDIA_REVIEW", "ACCEPTED", "REVISION_REQUESTED", "CREATIVE_APPROVED", "SCHEDULED", "LIVE"];

function StatCard({ icon: Icon, label, value, hint, tone = "emerald", href }) {
    const tones = {
        emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
        amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
        sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
        violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    };
    const body = (
        <>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
            {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </>
    );
    const cls = "block rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
    return href ? <Link href={href} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const Badge = ({ status, kind = bookingStatus }) => {
    const s = kind(status);
    return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
};

export default function DashboardPage() {
    const [me, setMe] = useState(null);
    const [bookings, setBookings] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const cart = useCart();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [meRes, bRes, cRes, pRes] = await Promise.all([
                getMe(),
                getBookings(),
                getCampaigns(),
                getPayments().catch(() => ({ data: [] })), // payments are a bonus; never block the page
            ]);
            setMe(meRes?.data || null);
            setBookings(Array.isArray(bRes?.data) ? bRes.data : []);
            setCampaigns(Array.isArray(cRes?.data) ? cRes.data : []);
            setPayments(Array.isArray(pRes?.data) ? pRes.data : []);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const stats = useMemo(() => {
        const now = new Date();
        const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s.key, 0]));
        for (const b of bookings) byStatus[b.status] = (byStatus[b.status] || 0) + 1;

        const paid = payments.filter((p) => p.status === "SUCCESSFUL" || p.status === "REFUNDED");
        const currency = paid[0]?.currency || bookings[0]?.currency || "NGN";
        const totalPaid = paid.reduce((t, p) => t + (Number(p.amount) || 0), 0);
        const refunded = payments.reduce((t, p) => t + (Number(p.refundAmount) || 0), 0);

        const upcoming = bookings
            .filter((b) => ["ACCEPTED", "SCHEDULED"].includes(b.status) && airTime(b) > now)
            .sort((a, b) => airTime(a) - airTime(b));

        const spendByCampaign = new Map();
        for (const b of bookings) {
            if (["REJECTED", "CANCELLED"].includes(b.status)) continue;
            const id = b.campaignId?._id || b.campaignId;
            spendByCampaign.set(String(id), (spendByCampaign.get(String(id)) || 0) + (Number(b.price) || 0));
        }

        return {
            total: bookings.length,
            byStatus,
            waiting: byStatus.PENDING + byStatus.CHANGES_REQUESTED,
            upcoming,
            aired: byStatus.COMPLETED,
            activeCampaigns: campaigns.filter((c) => OPEN_CAMPAIGN.includes(c.status)).length,
            netSpent: totalPaid - refunded,
            refunded,
            currency,
            spendByCampaign,
        };
    }, [bookings, campaigns, payments]);

    if (loading) return <PageLoading label="Loading your dashboard…" />;
    if (error) return <ApiErrorState error={error} what="your dashboard" onRetry={load} />;

    const firstName = me?.name?.trim()?.split(" ")[0] || "there";
    const next = stats.upcoming[0];
    const recent = bookings.slice(0, 5);
    const hasActivity = bookings.length > 0 || campaigns.length > 0;

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back, {firstName}</h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {hasActivity ? "Here’s how your advertising is going." : "Create a campaign and book your first spots."}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/campaigns" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <Plus className="h-4 w-4" /> New campaign
                    </Link>
                    <Link href="/stations" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">
                        <Radio className="h-4 w-4" /> Book spots
                    </Link>
                </div>
            </motion.div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard icon={CalendarDays} label="Bookings made" value={stats.total} hint={`${stats.aired} aired`} href="/bookings" />
                <StatCard icon={Hourglass} label="Waiting for stations" value={stats.waiting} hint={stats.byStatus.CHANGES_REQUESTED ? `${stats.byStatus.CHANGES_REQUESTED} need your changes` : "Stations respond here"} tone="amber" href="/bookings" />
                <StatCard icon={CalendarCheck} label="Upcoming spots" value={stats.upcoming.length} hint="Accepted or scheduled" tone="sky" href="/bookings" />
                <StatCard icon={Megaphone} label="Active campaigns" value={stats.activeCampaigns} hint={`${campaigns.length} in total`} tone="violet" href="/campaigns" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard icon={Wallet} label="Total spent" value={formatMoney(stats.netSpent, stats.currency)} hint="Paid, minus refunds" />
                <StatCard icon={Undo2} label="Refunded to you" value={formatMoney(stats.refunded, stats.currency)} hint="Declined or cancelled spots" tone="sky" />
                <StatCard icon={ShoppingCart} label="In your cart" value={`${cart.count} spot${cart.count === 1 ? "" : "s"}`} hint={cart.count ? "Ready to check out" : "Add spots from Stations"} tone="amber" href="/cart" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Next on air */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                        <Clock className="h-4 w-4 text-emerald-500" /> Next on air
                    </h2>
                    {next ? (
                        <div className="mt-4">
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">{next.stationId?.name || "Station"}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {formatDate(next.date)} at {next.time} · {next.duration} min
                            </p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{next.campaignId?.name}</p>
                            <div className="mt-3 flex items-center gap-2">
                                <Badge status={next.status} />
                                <span className="text-sm font-medium text-slate-900 dark:text-white">{formatMoney(next.price, next.currency)}</span>
                            </div>
                            {stats.upcoming.length > 1 && (
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">+{stats.upcoming.length - 1} more coming up</p>
                            )}
                        </div>
                    ) : (
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                            Nothing scheduled yet. Once a station accepts a spot, it shows here.
                        </p>
                    )}
                </div>

                {/* Bookings by status */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Bookings by status</h2>
                    {stats.total ? (
                        <>
                            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Bookings by status">
                                {STATUS_ORDER.filter((s) => stats.byStatus[s.key]).map((s) => (
                                    <div key={s.key} className={s.color} style={{ width: `${(stats.byStatus[s.key] / stats.total) * 100}%` }} />
                                ))}
                            </div>
                            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                                {STATUS_ORDER.filter((s) => stats.byStatus[s.key]).map((s) => (
                                    <li key={s.key} className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                                            {bookingStatus(s.key).label}
                                        </span>
                                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{stats.byStatus[s.key]}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No bookings yet. Add spots to your cart and check out to send your first requests.</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Recent bookings */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent bookings</h2>
                        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            View all <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {recent.length ? (
                        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                            {recent.map((b) => (
                                <li key={b._id} className="flex items-center justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.stationId?.name || "Station"}</p>
                                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{formatDate(b.date)} · {b.time} · {b.campaignId?.name}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(b.price, b.currency)}</span>
                                        <Badge status={b.status} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Your booking requests will show here.</p>
                    )}
                </div>

                {/* Campaigns */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Your campaigns</h2>
                        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            View all <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {campaigns.length ? (
                        <ul className="mt-4 space-y-4">
                            {campaigns.slice(0, 4).map((c) => {
                                const spent = stats.spendByCampaign.get(String(c._id)) || 0;
                                const budget = Number(c.budget) || 0;
                                const pct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
                                return (
                                    <li key={c._id}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.name}</p>
                                            <Badge status={c.status} kind={campaignStatus} />
                                        </div>
                                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {formatMoney(spent, c.currency || "NGN")} booked{budget > 0 ? ` of ${formatMoney(budget, c.currency || "NGN")} budget (${pct}%)` : ""}
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="mt-4">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No campaigns yet.</p>
                            <Link href="/campaigns" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                Create your first campaign <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {!hasActivity && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Advertise in three steps</h2>
                    <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                            { href: "/campaigns", icon: Megaphone, title: "1. Create a campaign", text: "Name it, set your budget and dates." },
                            { href: "/stations", icon: Radio, title: "2. Add spots to your cart", text: "Pick stations, dates and times — mix as many as you like." },
                            { href: "/bookings", icon: CheckCircle2, title: "3. Pay once and track", text: "Stations get your requests and respond here." },
                        ].map((step) => (
                            <li key={step.href}>
                                <Link href={step.href} className="flex h-full gap-3 rounded-xl bg-slate-50 p-3 text-sm transition-colors hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-500/10">
                                    <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                    <span>
                                        <span className="block font-medium text-slate-900 dark:text-white">{step.title}</span>
                                        <span className="text-slate-500 dark:text-slate-400">{step.text}</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}
