"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, CalendarDays, Radio } from "lucide-react";
import { getPayment } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { bookingStatus, formatMoney, formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// After checkout: the payment as recorded by the server, and the booking
// request now sent to each station.

export default function ConfirmationView() {
    const params = useSearchParams();
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const paymentId = params.get("payment");
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(!!paymentId);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!paymentId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await getPayment(paymentId);
            setPayment(result?.data || null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [paymentId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (!paymentId) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <EmptyState
                    icon={CheckCircle2}
                    title="No payment to show"
                    message="Your booking requests and their status are on the Bookings page."
                    action={<Link href={paths.bookings} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">View bookings</Link>}
                />
            </div>
        );
    }

    if (loading) return <PageLoading label="Loading your confirmation…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="this payment" onRetry={load} /></div>;
    if (!payment) return null;

    const testMode = payment.provider === "STUB";

    return (
        <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Booking requests sent</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {payment.bookings?.length || 0} station request{payment.bookings?.length === 1 ? "" : "s"} for{" "}
                    <span className="font-medium text-slate-700 dark:text-slate-200">{payment.campaignId?.name || "your campaign"}</span>.
                    Each station will accept, decline or ask for changes.
                </p>
            </motion.div>

            <section className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Amount{testMode ? " (test mode)" : ""}</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(payment.amount, payment.currency)}</p>
                    {Number(payment.platformFee) > 0 && (
                        <p className="text-xs text-slate-400">incl. {formatMoney(payment.platformFee, payment.currency)} service fee</p>
                    )}
                </div>
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Reference</p>
                    <p className="font-mono text-slate-900 dark:text-white">{payment.reference}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Date</p>
                    <p className="text-slate-900 dark:text-white">{formatDate(payment.createdAt)}</p>
                </div>
                {testMode && (
                    <p className="sm:col-span-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        Test mode: no money was charged.
                    </p>
                )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(payment.bookings || []).map((b) => {
                        const st = bookingStatus(b.status);
                        return (
                            <li key={b._id} className="flex items-start justify-between gap-4 px-4 py-3">
                                <div>
                                    <p className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                                        <Radio className="h-4 w-4 text-emerald-500" /> {b.stationId?.name || "Station"}
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {formatDate(b.date)} at {b.time} · {b.duration} min · Ref {b.bookingReference}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{formatMoney(b.price, b.currency)}</p>
                                    <p className="text-xs text-slate-500">{st?.label || b.status}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href={paths.bookings} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                    <CalendarDays className="h-4 w-4" /> Track bookings
                </Link>
                <Link href={paths.stations} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    Book more
                </Link>
            </div>
        </div>
    );
}
