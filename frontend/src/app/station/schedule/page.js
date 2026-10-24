"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { getStationBookings } from "@/lib/api";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Accepted and scheduled spots, grouped by day (from GET /bookings/station).
export default function StationSchedulePage() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getStationBookings();
            setBookings(result?.data || []);
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

    const days = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        const groups = new Map();
        bookings
            .filter((b) => ["ACCEPTED", "SCHEDULED"].includes(b.status) && String(b.date).slice(0, 10) >= today)
            .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
            .forEach((b) => {
                const key = String(b.date).slice(0, 10);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(b);
            });
        return [...groups.entries()];
    }, [bookings]);

    if (loading) return <PageLoading label="Loading your schedule…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <CalendarDays className="h-6 w-6 text-emerald-500" />
                    Schedule
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Spots you&apos;ve accepted, by day. Mark them scheduled and, once aired, complete them on the requests page.</p>
            </motion.div>

            {error ? (
                <ApiErrorState error={error} what="your schedule" onRetry={load} />
            ) : days.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nothing scheduled yet" message="Accepted booking requests appear here by date." action={<Link href="/station/requests" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">View requests</Link>} />
            ) : (
                <div className="space-y-5">
                    {days.map(([day, items]) => (
                        <section key={day} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-white">{formatDate(day)}</h2>
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((b) => (
                                    <li key={b._id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                        <span>
                                            <span className="font-medium text-slate-900 dark:text-white">{b.time}</span>
                                            <span className="text-slate-500"> · {b.duration} min · {b.stationId?.name} · {b.companyId?.name || b.userId?.name || "Advertiser"}</span>
                                        </span>
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${b.status === "SCHEDULED" ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
                                            {b.status === "SCHEDULED" ? "Scheduled" : "Accepted"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
