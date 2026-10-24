const Campaign = require('../models/Campaign');

// ─────────────────────────────────────────────────────────────
// CAMPAIGN STATUS TRANSITIONS
//
// The Campaign schema enum answers "is this a known status?".
// These maps answer "may this actor move a campaign from its current
// status to that one?". Both checks are required.
//
// Only transitions backed by an operation that exists today are listed:
//
//   CUSTOMER  PATCH /api/v1/campaigns/:id/status
//             (company users with CAMPAIGN_SUBMIT): submit, cancel,
//             resubmit after a requested revision.
//
//   ADMIN     PATCH /api/v1/admin/individuals/:id/campaigns/:campaignId/status
//             (requireAdmin): acts on behalf of an individual and reviews
//             submitted campaigns (accept / reject / request revision).
//
// Payment states (PAYMENT_PENDING, PAYMENT_SUCCESSFUL, REFUNDED,
// DISPUTED, FAILED) and station / delivery states (BOOKING_REQUESTS_SENT,
// MEDIA_REVIEW, CREATIVE_APPROVED, SCHEDULED, LIVE, PROOF_UPLOADED,
// COMPANY_REVIEW, COMPLETED, EXPIRED) are deliberately unreachable here.
// They belong to server-side workflows (payment provider, station
// actions) that are not implemented yet; those workflows must add their
// own transitions rather than reuse these client-facing maps.
// ─────────────────────────────────────────────────────────────

const CAMPAIGN_STATUSES = Campaign.schema.path('status').enumValues;

const CAMPAIGN_STATUS_TRANSITIONS = {
    CUSTOMER: {
        DRAFT: ['SUBMITTED', 'CANCELLED'],
        SUBMITTED: ['CANCELLED'],
        REVISION_REQUESTED: ['SUBMITTED', 'CANCELLED'],
    },

    ADMIN: {
        DRAFT: ['SUBMITTED', 'CANCELLED'],
        SUBMITTED: ['ACCEPTED', 'REJECTED', 'REVISION_REQUESTED', 'CANCELLED'],
        REVISION_REQUESTED: ['SUBMITTED', 'CANCELLED'],
        ACCEPTED: ['CANCELLED'],
    },
};

const isKnownCampaignStatus = (status) =>
    typeof status === 'string' && CAMPAIGN_STATUSES.includes(status);

const canTransitionCampaignStatus = (actor, fromStatus, toStatus) =>
    (CAMPAIGN_STATUS_TRANSITIONS[actor]?.[fromStatus] || []).includes(toStatus);

// ── Booking requests ──
// There is no campaign→booking orchestration yet, so any open campaign
// (including DRAFT, as the current booking flow allows) can request media.
// Closed or failed campaigns cannot.
const CAMPAIGN_STATUSES_CLOSED_TO_BOOKING = [
    'REJECTED',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'REFUNDED',
    'DISPUTED',
    'FAILED',
];

const canCampaignRequestBookings = (status) =>
    isKnownCampaignStatus(status || 'DRAFT') &&
    !CAMPAIGN_STATUSES_CLOSED_TO_BOOKING.includes(status);

// ── Checkout (server-side workflow, POST /payments/checkout) ──
// Once paid booking requests have been sent to stations, an open campaign
// that had not yet reached a station stage moves to BOOKING_REQUESTS_SENT.
// Any other open status (already sent, under review, …) is left as it is.
const CHECKOUT_CAMPAIGN_TRANSITIONS = {
    DRAFT: 'BOOKING_REQUESTS_SENT',
    SUBMITTED: 'BOOKING_REQUESTS_SENT',
    ACCEPTED: 'BOOKING_REQUESTS_SENT',
    REVISION_REQUESTED: 'BOOKING_REQUESTS_SENT',
};

const campaignStatusAfterCheckout = (status) =>
    CHECKOUT_CAMPAIGN_TRANSITIONS[status || 'DRAFT'] || null;

module.exports = {
    CAMPAIGN_STATUSES,
    CAMPAIGN_STATUS_TRANSITIONS,
    CAMPAIGN_STATUSES_CLOSED_TO_BOOKING,
    isKnownCampaignStatus,
    canTransitionCampaignStatus,
    canCampaignRequestBookings,
    campaignStatusAfterCheckout,
};
