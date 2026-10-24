"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Inbox, CalendarCheck, BadgeCheck, Wallet, ArrowRight, AlertTriangle } from "lucide-react";
import { getStationPortalSummary } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Station overview: what needs a response, what's coming up, and earnings
// from paid bookings (GET /station-portal/summary).

function Stat({ icon: Icon, label, value, href, tone = "slate" }) {
    const tones = {
        slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
        emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
    const body = (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    );
    return href ? <Link href={href} className="block transition-shadow hover:shadow-md">{body}</Link> : body;
}

export default function StationOverviewPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getStationPortalSummary();
            setData(result?.data || null);
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

    if (loading) return <PageLoading label="Loading your station dashboard…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="your station dashboard" onRetry={load} /></div>;

    const counts = data?.counts || {};
    const [currency, earnings] = Object.entries(data?.earnings || {})[0] || ["NGN", { booked: 0, completed: 0, thisMonth: 0 }];
    const inactive = (data?.stations || []).filter((s) => s.approvalStatus !== "APPROVED" || !s.isActive);

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {(data?.stations || []).map((s) => s.name).join(" · ") || "Your station"}
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Booking requests, your schedule and earnings in one place.</p>
            </motion.div>

            {inactive.length > 0 && (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>{inactive.map((s) => s.name).join(", ")} {inactive.length === 1 ? "is" : "are"} not live right now, so advertisers can&apos;t book {inactive.length === 1 ? "it" : "them"}. Contact Media Masters if this is unexpected.</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={Inbox} label="Waiting for your response" value={counts.needsResponse || 0} href="/station/requests" tone={counts.needsResponse ? "amber" : "slate"} />
                <Stat icon={CalendarCheck} label="Accepted · scheduled" value={`${counts.accepted || 0} · ${counts.scheduled || 0}`} href="/station/schedule" />
                <Stat icon={BadgeCheck} label="Completed" value={counts.completed || 0} tone="emerald" />
                <Stat icon={Wallet} label="Paid this month" value={formatMoney(earnings.thisMonth, currency)} tone="emerald" />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Coming up</h2>
                    <Link href="/station/schedule" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        Full schedule <ArrowRight className="h-4 w-4" />
                    </Link>
                </header>
                {(data?.upcoming || []).length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">No accepted spots coming up yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.upcoming.map((b) => (
                            <li key={b._id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                                <span className="text-slate-900 dark:text-white">
                                    {formatDate(b.date)} at {b.time} · {b.duration} min
                                    <span className="block text-xs text-slate-500">{b.stationId?.name} · Ref {b.bookingReference}</span>
                                </span>
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{b.status === "SCHEDULED" ? "Scheduled" : "Accepted"}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900">
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Paid bookings (all time)</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(earnings.booked, currency)}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Of which aired (completed)</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(earnings.completed, currency)}</p>
                </div>
                <p className="text-xs text-slate-400 sm:col-span-2">Payments currently run in test mode; payouts to stations start when online payment goes live.</p>
            </section>
        </div>
    );
}
