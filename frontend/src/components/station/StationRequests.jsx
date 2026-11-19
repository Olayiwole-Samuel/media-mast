"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Loader2, Check, X, MessageSquareWarning, CalendarCheck, BadgeCheck, FileText, Film, Ban, Coins } from "lucide-react";
import {
    getStationBookings,
    acceptStationBooking,
    rejectStationBooking,
    requestStationBookingChanges,
    scheduleStationBooking,
    completeStationBooking,
    markStationBookingAired,
    markStationBookingNotAired,
    uploadFileInParts,
    scheduleAllStationBookings,
} from "@/lib/api";
import { bookingStatus, formatMoney, formatDate, spotHasAired, ESCROW_STATUS } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import BookingAdvert from "@/components/station/BookingAdvert";
import StationBulkPanels from "@/components/station/StationBulkPanels";

// Booking requests for the stations the signed-in account operates
// (GET /bookings/station): a STATION account, or a company linked to a station.
// Only the actions the backend allows from each status are shown:
//   PENDING → accept / decline / ask to reschedule (with a suggested date) ·
//   ACCEPTED → schedule ·
//   SCHEDULED → mark as aired (complete) once the slot has ended.
// Wallet bookings: the advertiser's money is held until the spot airs. To be
// paid, mark it aired with the TX log and a clip; or say it didn't air (the
// advertiser is refunded). Payment follows the advertiser's dispute window.

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

const STATION_ESCROW = {
    HELD: "Money held: you're paid once it airs",
    AIRED: "Aired: payment after the advertiser's check",
    DISPUTED: "Disputed: payment on hold while Media Masters reviews",
    RELEASED: "Paid to your earnings",
    REFUNDED: "Refunded to the advertiser",
    SPLIT: "Part paid, part refunded",
};

// After the slot: upload the TX log and a clip, or say it didn't air.
function AiredPanel({ booking, busy, onAction }) {
    const [log, setLog] = useState(null);
    const [clip, setClip] = useState(null);
    const [note, setNote] = useState("");
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState("");
    const [notAired, setNotAired] = useState(false);
    const needsProof = !!booking.escrow;
    const working = busy || progress !== null;

    const submit = async () => {
        setError("");
        if (needsProof && (!log || !clip)) return setError("Attach the TX log and a clip of the spot on air.");
        try {
            let ids = {};
            if (needsProof) {
                setProgress(0);
                const l = await uploadFileInParts(log, "PROOF_LOG", (p) => setProgress(p * 0.2));
                const c = await uploadFileInParts(clip, "PROOF_CLIP", (p) => setProgress(0.2 + p * 0.8));
                ids = { logUploadId: l.uploadId, clipUploadId: c.uploadId };
            }
            setProgress(null);
            await onAction("complete", booking, { ...ids, note });
        } catch (err) {
            setProgress(null);
            setError(err?.message || "Upload failed. Try again.");
        }
    };

    const fileBox = (label, Icon, file, setFile, accept) => (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm hover:border-emerald-400 dark:border-slate-700">
            <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{file ? file.name : label}</span>
            <input type="file" accept={accept} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
    );

    return (
        <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            {needsProof ? (
                <>
                    <p className="text-sm text-slate-700 dark:text-slate-200">Did it air? Upload proof to be paid.</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {fileBox("TX log (PDF, image, Excel)", FileText, log, setLog, ".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx,.csv")}
                        {fileBox("Clip of the spot on air", Film, clip, setClip, "video/*,audio/*,image/*")}
                    </div>
                </>
            ) : (
                <p className="text-sm text-slate-700 dark:text-slate-200">Did it air?</p>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={notAired ? "Why it couldn't air (the advertiser sees this)" : "Optional note, e.g. aired at 22:14"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {progress !== null && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Uploading proof… {Math.round(progress * 100)}%</p>}
            <div className="flex flex-wrap gap-2">
                {!notAired ? (
                    <>
                        <button type="button" disabled={working} onClick={submit} className={`${buttonBase} bg-emerald-500 text-white hover:bg-emerald-600`}>
                            <BadgeCheck className="h-4 w-4" /> Mark as aired
                        </button>
                        <button type="button" disabled={working} onClick={() => setNotAired(true)} className={`${buttonBase} bg-white text-red-600 hover:bg-red-50 dark:bg-slate-900 dark:text-red-400`}>
                            <Ban className="h-4 w-4" /> It didn&apos;t air
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" disabled={working || !note.trim()} onClick={() => onAction("notAired", booking, { note })} className={`${buttonBase} bg-red-500 text-white hover:bg-red-600`}>
                            <Ban className="h-4 w-4" /> Confirm: not aired (refund the advertiser)
                        </button>
                        <button type="button" disabled={working} onClick={() => setNotAired(false)} className={`${buttonBase} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}>Back</button>
                    </>
                )}
            </div>
        </div>
    );
}

function BookingCard({ booking, busy, onAction }) {
    const [note, setNote] = useState("");
    const [asking, setAsking] = useState(false);
    const [proposedDate, setProposedDate] = useState("");
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
                        {booking.stationId?.name || "Station"} · {formatDate(booking.date)}{booking.slot === "PROGRAMME" || booking.slot === "EDITION" || booking.slot === "DISPLAY" ? "" : ` from ${booking.time}`}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {booking.rateName ? `${booking.rateName}${booking.spotSeconds ? ` · ${booking.spotSeconds}s spot` : ""}` : `${booking.duration} min · ${booking.slot}`} · {advertiser}
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

            {booking.escrow && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Coins className="h-3.5 w-3.5 text-amber-500" /> {STATION_ESCROW[booking.escrow.status] || ESCROW_STATUS[booking.escrow.status]?.label}
                    {booking.escrow.status === "AIRED" && booking.escrow.releaseAt ? ` (by ${new Date(booking.escrow.releaseAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}
                    {booking.escrow.status === "DISPUTED" && booking.escrow.dispute?.details ? `: "${booking.escrow.dispute.details}"` : ""}
                </p>
            )}

            <BookingAdvert booking={booking} />

            {booking.stationNote && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Your note: {booking.stationNote}
                </p>
            )}
            {booking.status === "CHANGES_REQUESTED" && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    Waiting for the advertiser to pick a new date{booking.proposedDate ? ` (you suggested ${formatDate(booking.proposedDate)})` : ""}.
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
                        <button type="button" disabled={busy} onClick={() => setAsking((a) => !a)} className={`${buttonBase} bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300`} aria-expanded={asking}>
                            <MessageSquareWarning className="h-4 w-4" /> Date taken? Ask to reschedule
                        </button>
                        <button type="button" disabled={busy} onClick={() => onAction("reject", booking, { note })} className={`${buttonBase} bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400`}>
                            <X className="h-4 w-4" /> Decline{booking.paymentStatus === "PAID" ? " (refunds advertiser)" : ""}
                        </button>
                    </div>
                    {asking && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                            <p className="text-sm text-amber-900 dark:text-amber-200">
                                The advertiser is told {formatDate(booking.date)} isn&apos;t available and picks a new date. Suggest one (optional) and add a note above if it helps.
                            </p>
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Suggested date</span>
                                    <input type="date" value={proposedDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setProposedDate(e.target.value)}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                                </label>
                                <button type="button" disabled={busy} onClick={() => onAction("changes", booking, { note, proposedDate })} className={`${buttonBase} bg-amber-500 text-white hover:bg-amber-600`}>
                                    Send reschedule request
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {booking.status === "ACCEPTED" && !aired && (
                <div className="mt-4">
                    <button type="button" disabled={busy} onClick={() => onAction("schedule", booking)} className={`${buttonBase} bg-emerald-500 text-white hover:bg-emerald-600`}>
                        <CalendarCheck className="h-4 w-4" /> Mark as scheduled
                    </button>
                </div>
            )}

            {["ACCEPTED", "SCHEDULED"].includes(booking.status) && (aired ? (
                <AiredPanel booking={booking} busy={busy} onAction={onAction} />
            ) : booking.status === "SCHEDULED" && (
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Once its time slot has ended, mark it aired with the TX log and a clip (or say it didn&apos;t air).</p>
            ))}
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

    // Earliest spot first (date, then time).
    const visible = useMemo(() => bookings.filter((b) => {
        if (filter === "ALL") return true;
        if (filter === "ACTION") return NEEDS_ACTION.includes(b.status);
        if (filter === "CLOSED") return ["REJECTED", "CANCELLED", "CHANGES_REQUESTED", "NOT_AIRED"].includes(b.status);
        return b.status === filter;
    }).sort((a, b) => String(a.date).slice(0, 10).localeCompare(String(b.date).slice(0, 10)) || String(a.time || "").localeCompare(String(b.time || ""))), [bookings, filter]);
    const acceptedCount = bookings.filter((b) => b.status === "ACCEPTED").length;
    const [schedulingAll, setSchedulingAll] = useState(false);
    const scheduleAll = async () => {
        setSchedulingAll(true);
        setNotice(null);
        try {
            const res = await scheduleAllStationBookings();
            setNotice({ type: "success", text: res?.message || "All accepted spots scheduled." });
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "Couldn't schedule them." });
        } finally {
            setSchedulingAll(false);
        }
    };

    const handleAction = async (action, booking, extra = {}) => {
        setBusyId(booking._id);
        setNotice(null);
        try {
            const note = extra.note?.trim() ? { note: extra.note.trim() } : {};
            const calls = {
                accept: () => acceptStationBooking(booking._id, note),
                reject: () => rejectStationBooking(booking._id, note),
                changes: () => requestStationBookingChanges(booking._id, { ...note, ...(extra.proposedDate ? { proposedDate: extra.proposedDate } : {}) }),
                schedule: () => scheduleStationBooking(booking._id),
                complete: () => (extra.logUploadId || booking.escrow
                    ? markStationBookingAired(booking._id, { logUploadId: extra.logUploadId, clipUploadId: extra.clipUploadId, note: extra.note?.trim() || undefined })
                    : completeStationBooking(booking._id)),
                notAired: () => markStationBookingNotAired(booking._id, extra.note?.trim()),
            };
            const result = await calls[action]();
            const updated = result?.data || {};
            // Keep populated fields (station, campaign, advertiser) from the list.
            // The server returns ids only: keep the populated advert, station, campaign and advertiser.
            setBookings((prev) => prev.map((b) => (b._id === booking._id ? { ...b, ...updated, stationId: b.stationId, campaignId: b.campaignId, companyId: b.companyId, userId: b.userId, paymentId: b.paymentId, creativeId: b.creativeId } : b)));
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
                    <StationBulkPanels bookings={bookings} onChanged={(text) => { setNotice({ type: "success", text }); load(); }} />
                    {acceptedCount > 0 && (
                        <div className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-sky-500/20 dark:bg-sky-500/10">
                            <p className="text-sky-900 dark:text-sky-200">{acceptedCount} accepted spot{acceptedCount === 1 ? "" : "s"} waiting to be scheduled.</p>
                            <button type="button" disabled={schedulingAll} onClick={scheduleAll} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-60">
                                {schedulingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Schedule all {acceptedCount}
                            </button>
                        </div>
                    )}
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
