"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Users, Megaphone, CalendarDays, HardDrive, TrendingUp, TrendingDown } from "lucide-react";
import { getCompanyUsage, getCompanyDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Company analytics from real endpoints only (both need ANALYTICS_VIEW):
//   GET /settings/usage    — team, campaign and booking counts, tracked storage
//   GET /company/dashboard — spend totals and this month vs last month
// A monthly chart is not drawn: the backend's monthly series currently
// returns the oldest 12 months rather than the latest, so it would mislead.

const Card = ({ icon: Icon, label, value, hint }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Icon className="h-4 w-4 text-emerald-500" />
            {label}
        </div>
        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
);

export default function CompanyAnalyticsPage() {
    const [usage, setUsage] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usageRes, dashRes] = await Promise.all([getCompanyUsage(), getCompanyDashboard()]);
            setUsage(usageRes?.data || null);
            setStats(dashRes?.data?.stats || null);
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

    const change = stats?.spendChange;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <BarChart3 className="h-6 w-6 text-emerald-500" />
                    Analytics
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">How your company is using Media Masters.</p>
            </motion.div>

            {loading ? (
                <PageLoading label="Loading analytics…" />
            ) : error ? (
                <ApiErrorState error={error} what="analytics" onRetry={load} />
            ) : (
                <div className="space-y-6">
                    <section>
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Spend</h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <Card icon={BarChart3} label="All time" value={formatMoney(stats?.totalSpend || 0)} hint="Accepted, scheduled and completed bookings" />
                            <Card icon={CalendarDays} label="This month" value={formatMoney(stats?.currentMonthSpend || 0)} />
                            <Card
                                icon={change < 0 ? TrendingDown : TrendingUp}
                                label="Last month"
                                value={formatMoney(stats?.previousMonthSpend || 0)}
                                hint={change === null || change === undefined ? "No spend last month to compare with" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% this month`}
                            />
                        </div>
                    </section>

                    <section>
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Usage</h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Card icon={Users} label="Team members" value={usage?.employeeCount ?? 0} />
                            <Card icon={Megaphone} label="Campaigns" value={usage?.campaignCount ?? 0} />
                            <Card icon={CalendarDays} label="Bookings" value={usage?.bookingCount ?? 0} />
                            <Card icon={HardDrive} label="Creative files" value={usage?.storageUsed || "0 MB"} hint="Based on the file sizes recorded with your creatives" />
                        </div>
                    </section>

                    <p className="text-xs text-slate-400">Monthly charts will appear here once the monthly figures are available from Media Masters.</p>
                </div>
            )}
        </div>
    );
}
