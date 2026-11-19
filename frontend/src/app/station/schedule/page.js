"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarDays, CalendarCheck, Loader2 } from "lucide-react";
import { getStationBookings, scheduleAllStationBookings } from "@/lib/api";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Accepted and scheduled spots, grouped by day (from GET /bookings/station).
const spotLine = (b) => b.rateName
    ? `${b.rateName}${b.spotSeconds ? ` · ${b.spotSeconds}s spot` : ""}`
    : `${b.time} · ${b.duration} min`;

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

    const accepted = bookings.filter((b) => b.status === "ACCEPTED").length;
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const scheduleAll = async () => {
        setBusy(true); setNotice("");
        try {
            const res = await scheduleAllStationBookings();
            setNotice(res?.message || "All accepted spots scheduled.");
            await load();
        } catch (err) {
            setNotice(err?.message || "Couldn't schedule them.");
        } finally { setBusy(false); }
    };

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

            {accepted > 0 && (
                <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-sky-500/20 dark:bg-sky-500/10">
                    <p className="text-sky-900 dark:text-sky-200">{accepted} accepted spot{accepted === 1 ? "" : "s"} not yet scheduled.</p>
                    <button type="button" disabled={busy} onClick={scheduleAll} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-60">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Schedule all {accepted}
                    </button>
                </div>
            )}
            {notice && <p role="status" className="mb-4 text-sm text-slate-600 dark:text-slate-300">{notice}</p>}

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
                                            <span className="font-medium text-slate-900 dark:text-white">{spotLine(b)}</span>
                                            <span className="text-slate-500"> · {b.stationId?.name} · {b.companyId?.name || b.userId?.name || "Advertiser"}{b.creativeId?.name ? ` · advert: ${b.creativeId.name}` : ""}</span>
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
