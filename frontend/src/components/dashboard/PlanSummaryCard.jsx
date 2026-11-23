"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, CalendarClock, Eye, Hourglass, RefreshCw } from "lucide-react";
import { getPlanSummary } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// Today at a glance for an advertiser running plans.
export default function PlanSummaryCard({ paths }) {
    const [d, setD] = useState(null);
    useEffect(() => { getPlanSummary().then((r) => setD(r.data)).catch(() => setD(null)); }, []);
    if (!d || (!d.liveCampaigns && !d.toCheck && !d.today)) return null;
    const stationsToday = Object.entries(d.todayByStation || {});
    const tiles = [
        { icon: Radio, label: "Spots today", value: d.today, hint: stationsToday.length ? stationsToday.slice(0, 3).map(([n, c]) => `${n} ${c}`).join(" · ") : "None today", href: paths.campaigns },
        { icon: CalendarClock, label: "Next 7 days", value: d.next7, hint: `${d.liveCampaigns} live campaign${d.liveCampaigns === 1 ? "" : "s"}`, href: paths.campaigns },
        { icon: Eye, label: "Aired: check the proof", value: d.toCheck, hint: d.toCheck ? "Confirm or dispute" : "Nothing to check", href: paths.bookings, tone: d.toCheck ? "amber" : null },
        { icon: Hourglass, label: "Waiting for media house", value: d.awaitingMediaHouse, hint: "Aired, not yet confirmed", href: paths.bookings },
        ...(d.toReschedule ? [{ icon: RefreshCw, label: "To reschedule", value: d.toReschedule, hint: "Pick new dates", href: paths.bookings, tone: "red" }] : []),
    ];
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white">Your plans today</h2>
                <span className="text-xs text-slate-500">On hold {formatMoney(d.held)} · available {formatMoney(d.available)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {tiles.map((t) => (
                    <Link key={t.label} href={t.href} className={`rounded-xl border p-3 transition-colors hover:border-emerald-300 ${t.tone === "amber" ? "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" : t.tone === "red" ? "border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" : "border-slate-200 dark:border-slate-800"}`}>
                        <t.icon className="h-4 w-4 text-emerald-600" />
                        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{t.value}</p>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{t.label}</p>
                        <p className="truncate text-[11px] text-slate-500">{t.hint}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
