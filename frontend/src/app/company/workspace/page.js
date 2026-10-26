"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Megaphone, CalendarDays, CheckCircle2, Wallet, Radio, ShieldCheck, Clock, ArrowRight, Lock } from "lucide-react";
import { getMyWorkspace } from "@/lib/api";
import { campaignStatus, bookingStatus, formatMoney, formatDate } from "@/lib/status";
import { PageLoading, PageError } from "@/components/common/PageState";

// An employee's own dashboard (GET /company/workspace): their role and
// permissions, the campaigns they created, the spots they booked and what
// airs next. Shortcuts only show for what they're allowed to do.

const PERMISSION_LABELS = {
    ALL_ACCESS: "Full access",
    CAMPAIGN_VIEW: "View campaigns",
    CAMPAIGN_CREATE: "Create campaigns",
    CAMPAIGN_EDIT: "Edit campaigns",
    CAMPAIGN_SUBMIT: "Submit campaigns",
    CAMPAIGN_APPROVE: "Approve campaigns",
    CAMPAIGN_DELETE: "Delete campaigns",
    BOOKING_VIEW: "View bookings",
    BOOKING_CREATE: "Book airtime",
    BOOKING_CANCEL: "Cancel bookings",
    BOOKING_APPROVE: "Handle station requests",
    CREATIVE_VIEW: "View creatives",
    CREATIVE_UPLOAD: "Upload creatives",
    CREATIVE_APPROVE: "Approve creatives",
    CREATIVE_DELETE: "Delete creatives",
    PAYMENTS_VIEW: "View payments",
    PAYMENTS_APPROVE: "Approve payments",
    ANALYTICS_VIEW: "View analytics",
    ANALYTICS_EXPORT: "Export analytics",
    TEAM_VIEW: "View team",
    TEAM_INVITE: "Invite team",
    TEAM_REMOVE: "Remove team",
    TEAM_EDIT: "Edit team",
};

const SHORTCUTS = [
    { href: "/company/campaigns", label: "Create a campaign", icon: Megaphone, needs: "CAMPAIGN_CREATE" },
    { href: "/company/stations", label: "Book airtime", icon: Radio, needs: "BOOKING_CREATE" },
    { href: "/company/bookings", label: "My bookings", icon: CalendarDays, needs: "BOOKING_VIEW" },
    { href: "/company/dashboard", label: "Company analytics", icon: CheckCircle2, needs: "ANALYTICS_VIEW" },
];

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";

function greeting() {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ label, value, hint, icon: Icon, tone }) {
    return (
        <div className={card}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                    {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
                </div>
                <div className={`shrink-0 rounded-lg p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div>
            </div>
        </div>
    );
}

export default function WorkspacePage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getMyWorkspace();
            setData(res?.data || null);
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

    if (loading && !data) return <PageLoading label="Loading your workspace…" />;
    if (error) return <PageError message={error?.message || "We couldn't load your workspace."} onRetry={load} />;
    if (!data) return null;

    const { me, company, stats, upcoming, recentCampaigns } = data;
    const perms = me.permissions || [];
    const can = (p) => me.isOwner || perms.includes("ALL_ACCESS") || perms.includes(p);
    const spend = stats.spend?.length ? stats.spend.map((s) => formatMoney(s.amount, s.currency)).join(" · ") : formatMoney(0);
    const shortcuts = SHORTCUTS.filter((s) => can(s.needs));

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-sm text-slate-500 dark:text-slate-400">{company.name}</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{greeting()}, {me.name?.split(" ")[0] || "there"}</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {me.position}{me.department ? ` · ${me.department}` : ""} — your campaigns, bookings and what airs next.
                </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="My campaigns" value={stats.campaignsTotal} hint={`${stats.campaignsActive} active · ${stats.campaignsDraft} draft`} icon={Megaphone} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
                <Stat label="Spots I booked" value={stats.bookingsTotal} hint={`${stats.bookingsPending} awaiting station`} icon={CalendarDays} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" />
                <Stat label="Scheduled · aired" value={`${stats.bookingsScheduled} · ${stats.bookingsCompleted}`} icon={CheckCircle2} tone="bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" />
                <Stat label="Paid for my spots" value={spend} icon={Wallet} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" />
            </div>

            {shortcuts.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {shortcuts.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-500" /> {label}</span>
                            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className={`${card} lg:col-span-2`}>
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Clock className="h-4 w-4 text-emerald-500" /> Coming up</h2>
                    {upcoming.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No upcoming spots from you yet.</p>
                    ) : (
                        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                            {upcoming.map((b) => {
                                const badge = bookingStatus(b.status);
                                return (
                                    <li key={b._id} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {formatDate(b.date)}{b.slot === "EDITION" ? " · print edition" : ` at ${b.time} · ${b.duration} min`}
                                            </p>
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                {b.station?.name || "Station"}{b.campaign ? ` · ${b.campaign}` : ""}{b.rateName ? ` · ${b.rateName}` : ""}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className={card}>
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-emerald-500" /> What I can do</h2>
                    {me.isOwner || perms.includes("ALL_ACCESS") ? (
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Full access to everything in {company.name}.</p>
                    ) : perms.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No permissions yet. Ask your company owner to give you access.</p>
                    ) : (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                            {perms.map((p) => (
                                <li key={p} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{PERMISSION_LABELS[p] || p}</li>
                            ))}
                        </ul>
                    )}
                    {!me.isOwner && (
                        <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Your company owner decides these. Ask them if you need more access.</p>
                    )}
                </section>
            </div>

            <section className={card}>
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900 dark:text-white">My recent campaigns</h2>
                    {can("CAMPAIGN_VIEW") && <Link href="/company/campaigns" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">All campaigns</Link>}
                </div>
                {recentCampaigns.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">You haven&apos;t created a campaign yet.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                        {recentCampaigns.map((c) => {
                            const badge = campaignStatus(c.status);
                            return (
                                <li key={c._id} className="flex items-center justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {c.startDate ? `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` : `Created ${formatDate(c.createdAt)}`}
                                            {c.budget ? ` · ${formatMoney(c.budget, c.currency)}` : ""}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
