// ─────────────────────────────────────────────────────────────
// Status display + allowed actions.
//
// Values are the exact backend status strings. Labels are only for display.
// The campaign transition maps mirror backend/src/utils/campaignStatus.js;
// they decide which buttons to show, the backend still decides what happens.
// ─────────────────────────────────────────────────────────────

const TONES = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
};

const CAMPAIGN_STATUS = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "info" },
    PAYMENT_PENDING: { label: "Awaiting payment", tone: "warning" },
    PAYMENT_SUCCESSFUL: { label: "Paid", tone: "purple" },
    BOOKING_REQUESTS_SENT: { label: "Sent to stations", tone: "info" },
    MEDIA_REVIEW: { label: "Station review", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    REVISION_REQUESTED: { label: "Changes requested", tone: "warning" },
    CREATIVE_APPROVED: { label: "Creative approved", tone: "success" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    LIVE: { label: "Live", tone: "success" },
    PROOF_UPLOADED: { label: "Proof uploaded", tone: "info" },
    COMPANY_REVIEW: { label: "Your review", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    REFUNDED: { label: "Refunded", tone: "purple" },
    DISPUTED: { label: "Disputed", tone: "danger" },
    FAILED: { label: "Failed", tone: "danger" },
};

const BOOKING_STATUS = {
    PENDING: { label: "Waiting for station", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    REJECTED: { label: "Declined", tone: "danger" },
    CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    COMPLETED: { label: "Completed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const CREATIVE_STATUS = {
    PENDING: { label: "Waiting for approval", tone: "warning" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    REVISION_REQUESTED: { label: "Changes requested", tone: "warning" },
};

const STATION_INVENTORY = {
    AVAILABLE: { label: "Available", tone: "success" },
    BOOKED: { label: "Fully booked", tone: "warning" },
    UNAVAILABLE: { label: "Unavailable", tone: "neutral" },
    MAINTENANCE: { label: "Maintenance", tone: "warning" },
};

const humanize = (value) =>
    String(value || "")
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^\w/, (c) => c.toUpperCase());

const lookup = (map) => (status) => {
    const entry = map[status];
    return {
        label: entry?.label || humanize(status) || "Unknown",
        className: TONES[entry?.tone || "neutral"],
    };
};

const PAYMENT_STATUS = {
    PENDING: { label: "Pending", tone: "warning" },
    SUCCESSFUL: { label: "Paid", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    REFUNDED: { label: "Refunded", tone: "purple" },
    DISPUTED: { label: "Disputed", tone: "danger" },
};

export const paymentStatus = lookup(PAYMENT_STATUS);
export const campaignStatus = lookup(CAMPAIGN_STATUS);
export const bookingStatus = lookup(BOOKING_STATUS);
export const creativeStatus = lookup(CREATIVE_STATUS);
export const stationInventoryStatus = lookup(STATION_INVENTORY);

// ── Campaign transitions (mirror of backend/src/utils/campaignStatus.js) ──
export const CAMPAIGN_TRANSITIONS = {
    CUSTOMER: {
        DRAFT: ["SUBMITTED", "CANCELLED"],
        SUBMITTED: ["CANCELLED"],
        REVISION_REQUESTED: ["SUBMITTED", "CANCELLED"],
    },
    ADMIN: {
        DRAFT: ["SUBMITTED", "CANCELLED"],
        SUBMITTED: ["ACCEPTED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"],
        REVISION_REQUESTED: ["SUBMITTED", "CANCELLED"],
        ACCEPTED: ["CANCELLED"],
    },
};

export const nextCampaignStatuses = (actor, current) =>
    CAMPAIGN_TRANSITIONS[actor]?.[current] || [];

// Button wording for a transition, from the customer's point of view.
const CAMPAIGN_ACTION_LABEL = {
    SUBMITTED: { DRAFT: "Submit", REVISION_REQUESTED: "Resubmit" },
    CANCELLED: "Cancel campaign",
    ACCEPTED: "Accept",
    REJECTED: "Reject",
    REVISION_REQUESTED: "Request changes",
};

export const campaignActionLabel = (current, next) => {
    const entry = CAMPAIGN_ACTION_LABEL[next];
    if (entry && typeof entry === "object") return entry[current] || "Submit";
    return entry || campaignStatus(next).label;
};

// The backend only deletes DRAFT or CANCELLED campaigns.
export const canDeleteCampaign = (status) => ["DRAFT", "CANCELLED"].includes(status);

// Editing is offered while the customer still owns the content.
export const canEditCampaign = (status) => ["DRAFT", "REVISION_REQUESTED"].includes(status);

// Advertisers can cancel spots that haven't aired (refund per the
// cancellation policy, shown before confirming).
// Same rule as the backend (booking.controller spotHasAired): a spot has aired
// once its slot has ended — date + time in Lagos (UTC+1) + duration minutes.
export const spotHasAired = (booking, now = new Date()) => {
    if (!booking?.date) return false;
    const d = new Date(booking.date);
    const [h, m] = String(booking.time || "00:00").split(":").map(Number);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 0, m || 0) - 60 * 60000;
    return start + (Number(booking.duration) || 0) * 60000 <= now.getTime();
};

export const canCancelBooking = (status) => ["PENDING", "ACCEPTED", "SCHEDULED", "CHANGES_REQUESTED"].includes(status);

// ── Money ──
export const formatMoney = (amount, currency = "NGN") => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "—";

    try {
        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: currency || "NGN",
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${currency || ""} ${value.toLocaleString()}`.trim();
    }
};

export const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};
