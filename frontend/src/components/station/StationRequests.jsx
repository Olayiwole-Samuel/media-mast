"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Loader2, Check, X, MessageSquareWarning, CalendarCheck, BadgeCheck } from "lucide-react";
import {
    getStationBookings,
    acceptStationBooking,
    rejectStationBooking,
    requestStationBookingChanges,
    scheduleStationBooking,
    completeStationBooking,
} from "@/lib/api";
import { bookingStatus, formatMoney, formatDate, spotHasAired } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Booking requests for the stations the signed-in account operates
// (GET /bookings/station): a STATION account, or a company linked to a station.
// Only the actions the backend allows from each status are shown:
//   PENDING → accept / decline / request changes · ACCEPTED → schedule ·
//   SCHEDULED → mark as aired (complete) once the slot has ended.

const FILTERS = [
    { value: "ACTION", label: "Needs action" },
    { value: "ALL", label: "All" },
    { value: "PENDING", label: "New" },
    { value: "ACCEPTED", label: "Accepted" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CLOSED", label: "Declined / cancelled" },
];

const NEEDS_ACTION = ["PENDING", "ACCEPTED", "SCHEDULED"];

const PAYMENT_BADGE = {
    PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
    UNPAID: { label: "Not paid", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    REFUNDED: { label: "Refunded", className: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300" },
};

const buttonBase = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";

function BookingCard({ booking, busy, onAction }) {
    const [note, setNote] = useState("");
    const aired = spotHasAired(booking);
    const st = bookingStatus(booking.status);
    const pay = PAYMENT_BADGE[booking.paymentStatus || "UNPAID"];
    const advertiser = booking.companyId?.name || booking.userId?.name || "Advertiser";
    const testPayment = booking.paymentId?.provider === "STUB";

    return (
        <li className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">
                        {booking.stationId?.name || "Station"} · {formatDate(booking.date)} at {booking.time}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {booking.duration} min · {booking.slot} · {advertiser}
                        {booking.campaignId?.name ? ` · ${booking.campaignId.name}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">Ref {booking.bookingReference}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2 sm:flex-col sm:items-end">
                    <span className="text-base font-semibold text-slate-900 dark:text-white">{formatMoney(booking.price, booking.currency)}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pay.className}`}>
                        {pay.label}{testPayment && booking.paymentStatus === "PAID" ? " (test mode)" : ""}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {st?.label || booking.status}
                    </span>
                </div>
            </div>

            {booking.stationNote && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Your note: {booking.stationNote}
                </p>
            )}

            {booking.status === "PENDING" && (
                <div className="mt-4 space-y-3">
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={1000}
                        placeholder="Optional note to the advertiser"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => onAction("accept", booking, { note })} className={`${buttonBase} bg-emerald-500 text-white hover:bg-emerald-600`}>
                            <Check className="h-4 w-4" /> Accept
                        </button>
                        <button type="button" disabled={busy} onClick={() => onAction("changes", booking, { note })} className={`${buttonBase} bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300`}>
                            <MessageSquareWarning className="h-4 w-4" /> Request changes
                        </button>
                        <button type="button" disabled={busy} onClick={() => onAction("reject", booking, { note })} className={`${buttonBase} bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400`}>
                            <X className="h-4 w-4" /> Decline{booking.paymentStatus === "PAID" ? " (refunds advertiser)" : ""}
                        </button>
                    </div>
                </div>
            )}

            {booking.status === "ACCEPTED" && (
                <div className="mt-4">
                    <button type="button" disabled={busy} onClick={() => onAction("schedule", booking)} className={`${buttonBase} bg-emerald-500 text-white hover:bg-emerald-600`}>
                        <CalendarCheck className="h-4 w-4" /> Mark as scheduled
                    </button>
                </div>
            )}

            {booking.status === "SCHEDULED" && (
                <div className="mt-4 space-y-2">
                    <button type="button" disabled={busy || !aired} onClick={() => onAction("complete", booking)} title={!aired ? "Available once the spot's time slot has ended" : undefined} className={`${buttonBase} bg-emerald-500 text-white hover:bg-emerald-600`}>
                        <BadgeCheck className="h-4 w-4" /> Mark as aired (complete)
                    </button>
                    {!aired && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">You can mark this as aired once its time slot has ended.</p>
                    )}
                </div>
            )}
        </li>
    );
}

export default function StationRequests({ wrapperClassName = "p-4 sm:p-6 lg:p-8" }) {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("ACTION");
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState(null);

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

    const visible = useMemo(() => bookings.filter((b) => {
        if (filter === "ALL") return true;
        if (filter === "ACTION") return NEEDS_ACTION.includes(b.status);
        if (filter === "CLOSED") return ["REJECTED", "CANCELLED", "CHANGES_REQUESTED"].includes(b.status);
        return b.status === filter;
    }), [bookings, filter]);

    const handleAction = async (action, booking, extra = {}) => {
        setBusyId(booking._id);
        setNotice(null);
        try {
            const note = extra.note?.trim() ? { note: extra.note.trim() } : {};
            const calls = {
                accept: () => acceptStationBooking(booking._id, note),
                reject: () => rejectStationBooking(booking._id, note),
                changes: () => requestStationBookingChanges(booking._id, note),
                schedule: () => scheduleStationBooking(booking._id),
                complete: () => completeStationBooking(booking._id),
            };
            const result = await calls[action]();
            const updated = result?.data || {};
            // Keep populated fields (station, campaign, advertiser) from the list.
            setBookings((prev) => prev.map((b) => (b._id === booking._id ? { ...b, ...updated, stationId: b.stationId, campaignId: b.campaignId, companyId: b.companyId, userId: b.userId, paymentId: b.paymentId } : b)));
            setNotice({ type: "success", text: result?.message || "Booking updated." });
        } catch (err) {
            setNotice({
                type: "error",
                text: err?.status === 403 ? "You don't have permission to manage station bookings." : err?.message || "We couldn't update this booking.",
            });
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoading label="Loading booking requests…" />;

    return (
        <div className={wrapperClassName}>
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Inbox className="h-6 w-6 text-emerald-500" />
                    Station requests
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Booking requests advertisers have sent to your stations. Accept, schedule and mark them as aired here.
                </p>
            </motion.div>

            {notice && (
                <div role="status" className={`mb-4 rounded-lg border p-3 text-sm ${notice.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"}`}>
                    {notice.text}
                </div>
            )}

            {error ? (
                <ApiErrorState error={error} what="your station's booking requests" onRetry={load} />
            ) : bookings.length === 0 ? (
                <EmptyState
                    icon={Inbox}
                    title="No booking requests yet"
                    message="When advertisers book your station, their requests appear here."
                />
            ) : (
                <div className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {FILTERS.map((f) => (
                            <button key={f.value} type="button" onClick={() => setFilter(f.value)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${filter === f.value ? "bg-emerald-500 text-white" : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {visible.length === 0 ? (
                        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">Nothing here right now.</p>
                    ) : (
                        <ul className="space-y-3">
                            {visible.map((b) => (
                                <BookingCard key={b._id} booking={b} busy={busyId === b._id} onAction={handleAction} />
                            ))}
                        </ul>
                    )}
                    {busyId && <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-500" />}
                </div>
            )}
        </div>
    );
}
