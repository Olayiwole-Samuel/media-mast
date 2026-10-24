"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { getBookings, cancelBooking, resubmitBooking, getBookingCancellationQuote } from "@/lib/api";
import { bookingStatus, canCancelBooking, formatMoney, formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import BookingRequestModal from "@/components/bookings/BookingRequestModal";
import CancellationDialog from "@/components/bookings/CancellationDialog";

// Company bookings (GET /bookings, needs BOOKING_VIEW). The price shown is the
// one stored on the booking by the server when it was requested.
// Accepting / scheduling / completing a booking is the station's job, so the
// customer only gets "Cancel request" here.

const FILTERS = [
    { value: "ALL", label: "All" },
    { value: "PENDING", label: "Waiting" },
    { value: "ACCEPTED", label: "Accepted" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CLOSED", label: "Declined / cancelled" },
];

const matchesFilter = (booking, filter) => {
    if (filter === "ALL") return true;
    if (filter === "CLOSED") return ["REJECTED", "CANCELLED"].includes(booking.status);
    return booking.status === filter;
};

const PAYMENT_LABEL = { PAID: "Paid", UNPAID: "Not paid", REFUNDED: "Refunded" };

export default function CompanyBookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("ALL");
    const [busyId, setBusyId] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [notice, setNotice] = useState(null);
    const [requestOpen, setRequestOpen] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const result = await getBookings();
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

    const visible = useMemo(() => bookings.filter((b) => matchesFilter(b, filter)), [bookings, filter]);

    const handleCancel = (booking) => {
        setNotice(null);
        setCancelTarget(booking);
    };

    const confirmCancel = async () => {
        const booking = cancelTarget;
        const result = await cancelBooking(booking._id);
        const d = result?.data || {};
        setBookings((prev) => prev.map((b) => (b._id === booking._id ? { ...b, status: d.status || "CANCELLED", paymentStatus: d.paymentStatus || b.paymentStatus, refundAmount: d.refundAmount } : b)));
        const refund = result?.cancellation?.refundAmount || 0;
        setNotice({ type: "success", text: refund > 0 ? `Booking cancelled. ${formatMoney(refund, booking.currency)} will be refunded.` : "Booking cancelled." });
        setCancelTarget(null);
    };

    const loadCancelQuote = useCallback(async () => (await getBookingCancellationQuote(cancelTarget._id))?.data, [cancelTarget]);

    const handleResubmit = async (booking) => {
        setBusyId(booking._id);
        setNotice(null);
        try {
            const result = await resubmitBooking(booking._id);
            setBookings((prev) => prev.map((b) => (b._id === booking._id ? { ...b, status: result?.data?.status || "PENDING" } : b)));
            setNotice({ type: "success", text: "Sent back to the station." });
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't resubmit this booking." });
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoading label="Loading your bookings…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <CalendarDays className="h-6 w-6 text-emerald-500" />
                        Bookings
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Your booking requests and their status with each station.</p>
                </div>
                {!error && (
                    <button type="button" onClick={() => setRequestOpen(true)} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                        <Plus className="h-4 w-4" /> Add spots
                    </button>
                )}
            </motion.div>

            {notice && (
                <div
                    className={`mb-4 rounded-lg border p-3 text-sm ${
                        notice.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                    }`}
                >
                    {notice.text}
                </div>
            )}

            {error ? (
                <ApiErrorState error={error} what="your bookings" onRetry={load} />
            ) : bookings.length === 0 ? (
                <EmptyState
                    icon={CalendarDays}
                    title="You don't have any bookings yet"
                    message="Pick stations and times, add them to your cart, and pay once. Stations receive your requests after payment."
                    action={
                        <button type="button" onClick={() => setRequestOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                            <Plus className="h-4 w-4" /> Add spots
                        </button>
                    }
                />
            ) : (
                <div className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {FILTERS.map((f) => (
                            <button
                                key={f.value}
                                type="button"
                                onClick={() => setFilter(f.value)}
                                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                    filter === f.value
                                        ? "bg-emerald-500 text-white"
                                        : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {visible.length === 0 ? (
                        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                            No bookings in this group.
                        </p>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            {/* Desktop table */}
                            <table className="hidden w-full text-sm md:table">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Reference</th>
                                        <th className="px-4 py-3 font-medium">Campaign</th>
                                        <th className="px-4 py-3 font-medium">Station</th>
                                        <th className="px-4 py-3 font-medium">When</th>
                                        <th className="px-4 py-3 font-medium">Price</th>
                                        <th className="px-4 py-3 font-medium">Status</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {visible.map((booking) => {
                                        const badge = bookingStatus(booking.status);
                                        return (
                                            <tr key={booking._id} className="text-slate-700 dark:text-slate-300">
                                                <td className="px-4 py-3 font-mono text-xs">{booking.bookingReference}</td>
                                                <td className="px-4 py-3">{booking.campaignId?.name || "—"}</td>
                                                <td className="px-4 py-3">{booking.stationId?.name || "—"}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {formatDate(booking.date)} · {booking.time} ({booking.duration} min)
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {formatMoney(booking.price, booking.currency)}
                                                    <span className="block text-xs text-slate-400">{PAYMENT_LABEL[booking.paymentStatus || "UNPAID"]}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {booking.status === "CHANGES_REQUESTED" && (
                                                        <button type="button" onClick={() => handleResubmit(booking)} disabled={busyId === booking._id} className="mr-3 text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400">
                                                            Resubmit
                                                        </button>
                                                    )}
                                                    {canCancelBooking(booking.status) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCancel(booking)}
                                                            disabled={busyId === booking._id}
                                                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                                                        >
                                                            {busyId === booking._id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                                            Cancel request
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Mobile cards */}
                            <ul className="divide-y divide-slate-200 md:hidden dark:divide-slate-800">
                                {visible.map((booking) => {
                                    const badge = bookingStatus(booking.status);
                                    return (
                                        <li key={booking._id} className="space-y-1.5 p-4 text-sm">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="truncate font-medium text-slate-900 dark:text-white">{booking.stationId?.name || "Station"}</p>
                                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400">{booking.campaignId?.name || "—"}</p>
                                            <p className="text-slate-500 dark:text-slate-400">
                                                {formatDate(booking.date)} · {booking.time} · {formatMoney(booking.price, booking.currency)} · {PAYMENT_LABEL[booking.paymentStatus || "UNPAID"]}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-xs text-slate-400">{booking.bookingReference}</span>
                                                {booking.status === "CHANGES_REQUESTED" && (
                                                    <button type="button" onClick={() => handleResubmit(booking)} disabled={busyId === booking._id} className="text-xs font-medium text-emerald-600 disabled:opacity-50 dark:text-emerald-400">
                                                        Resubmit
                                                    </button>
                                                )}
                                                {canCancelBooking(booking.status) && (
                                                    <button type="button" onClick={() => handleCancel(booking)} disabled={busyId === booking._id} className="text-xs font-medium text-red-600 disabled:opacity-50 dark:text-red-400">
                                                        Cancel request
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <BookingRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} onCreated={load} />

            <CancellationDialog
                open={!!cancelTarget}
                title={cancelTarget ? `Cancel booking ${cancelTarget.bookingReference}?` : ""}
                currency={cancelTarget?.currency}
                loadQuote={loadCancelQuote}
                onConfirm={confirmCancel}
                onClose={() => setCancelTarget(null)}
            />
        </div>
    );
}
