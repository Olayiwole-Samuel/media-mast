"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, Users, Calendar, CreditCard, Megaphone, Radio, ArrowRight } from "lucide-react";
import { getCompanyDashboard } from "@/lib/api";
import { useSession, isCompanyOwner } from "@/lib/auth";
import { campaignStatus, bookingStatus, formatMoney, formatDate } from "@/lib/status";
import { PageLoading, PageError } from "@/components/common/PageState";

// Company dashboard: everything shown comes from GET /company/dashboard
// (needs ANALYTICS_VIEW; owners have it through ALL_ACCESS).

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.21, 0.47, 0.32, 0.98] } },
};

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

const StatCard = ({ label, value, icon: Icon, tone }) => (
    <motion.div
        variants={itemVariants}
        className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 truncate text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
            <div className={`shrink-0 rounded-lg p-2.5 ${tone}`}>
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </motion.div>
);

const QuickLinks = () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
            { href: "/company/campaigns", label: "Your campaigns", icon: Megaphone },
            { href: "/company/bookings", label: "Your bookings", icon: Calendar },
            { href: "/company/stations", label: "Browse stations", icon: Radio },
        ].map(({ href, label, icon: Icon }) => (
            <Link
                key={href}
                href={href}
                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
                <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-emerald-500" />
                    {label}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
        ))}
    </div>
);

export default function CompanyDashboardPage() {
    const { user } = useSession();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await getCompanyDashboard();
            setData(result?.data || null);
        } catch (err) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const firstName = user?.name?.split(" ")[0] || "there";

    const header = (
        <motion.header variants={itemVariants}>
            <div className="flex flex-col gap-2 border-b border-slate-200/60 pb-6 dark:border-slate-800/60">
                <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[30px]">
                    {`${getGreeting()}, ${firstName}`}
                </h1>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    {data?.company?.name ? `${data.company.name} · ` : ""}
                    {isCompanyOwner(user) ? "Company owner" : "Team member"}
                </p>
            </div>
        </motion.header>
    );

    if (isLoading) return <PageLoading label="Loading your dashboard…" />;

    if (error) {
        return (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-4 sm:p-6 lg:p-8">
                {header}
                {error.status === 403 ? (
                    <div className="space-y-4">
                        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                            Company figures are only shown to people with analytics access. You can still use the
                            sections below that you have access to.
                        </p>
                        <QuickLinks />
                    </div>
                ) : (
                    <PageError title="We couldn't load your dashboard" message={error.message} onRetry={load} />
                )}
            </motion.div>
        );
    }

    const stats = data?.stats || {};
    const recentCampaigns = data?.recentCampaigns || [];
    const recentActivity = data?.recentActivity || [];
    const upcomingBookings = data?.upcomingBookings || [];

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="min-h-screen">
            <div className="w-full space-y-6 p-4 sm:p-6 lg:p-8">
                {header}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Total spend" value={formatMoney(stats.totalSpend || 0)} icon={CreditCard} tone="bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10" />
                    <StatCard label="Live campaigns" value={stats.activeCampaigns || 0} icon={TrendingUp} tone="bg-blue-50 text-blue-500 dark:bg-blue-500/10" />
                    <StatCard label="Team members" value={stats.employeeCount || 0} icon={Users} tone="bg-purple-50 text-purple-500 dark:bg-purple-500/10" />
                    <StatCard label="Waiting for stations" value={stats.pendingBookings || 0} icon={Calendar} tone="bg-orange-50 text-orange-500 dark:bg-orange-500/10" />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <motion.section variants={itemVariants} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Recent campaigns</h3>
                        {recentCampaigns.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                                <Megaphone className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
                                <p className="text-sm">You don&apos;t have any campaigns yet</p>
                                <Link href="/company/campaigns" className="mt-2 inline-block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Create your first campaign
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentCampaigns.map((campaign) => {
                                    const badge = campaignStatus(campaign.status);
                                    return (
                                        <div key={campaign._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{campaign.name}</p>
                                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                                                    {badge.label}
                                                </span>
                                            </div>
                                            <span className="shrink-0 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                                {formatMoney(campaign.budget, campaign.currency)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.section>

                    <motion.section variants={itemVariants} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Upcoming bookings</h3>
                        {upcomingBookings.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                                <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
                                <p className="text-sm">No upcoming bookings</p>
                                <Link href="/company/stations" className="mt-2 inline-block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Find a station to book
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {upcomingBookings.map((booking) => {
                                    const badge = bookingStatus(booking.status);
                                    return (
                                        <div key={booking.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                                    {booking.station?.name || "Station"} · {booking.campaign?.name || "Campaign"}
                                                </p>
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                    {formatDate(booking.date)} at {booking.time}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.section>
                </div>

                <motion.section variants={itemVariants} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Recent activity</h3>
                    {recentActivity.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No activity yet. Activity appears here as your team uses Media Masters.</p>
                    ) : (
                        <div className="space-y-3">
                            {recentActivity.map((activity) => (
                                <div key={activity._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
                                    <p className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">
                                        {activity.action ? campaignStatus(activity.action).label : "Activity"}
                                    </p>
                                    <p className="shrink-0 text-xs text-slate-400">
                                        {activity.userId?.name || "System"} · {formatDate(activity.createdAt)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.section>
            </div>
        </motion.div>
    );
}
