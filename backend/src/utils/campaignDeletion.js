const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');
const Creative = require('../models/Creative');

// ─────────────────────────────────────────────────────────────
// CAMPAIGN DELETION (shared by the company and admin delete routes)
//
// A campaign is only physically deleted when no booking has ever been
// made for it. Bookings are history (station, price, outcome) and keep a
// required campaignId, so a campaign with any booking — in any status,
// including CANCELLED / REJECTED / COMPLETED — is never deleted and its
// bookings and creatives are left untouched.
//
// Order of operations (no transactions in this project):
//   1. preflight: any booking? → refuse, nothing changed
//   2. delete the campaign
//   3. re-check: a booking created in between? → restore the campaign
//      document as it was and refuse
//   4. only then delete the campaign's creatives (unusable without it)
// ─────────────────────────────────────────────────────────────

const CAMPAIGN_HAS_BOOKINGS_MESSAGE =
    'This campaign cannot be deleted because it has booking history.';

const hasBookingHistory = async (campaignId) =>
    Boolean(await Booking.findOne({ campaignId }).select('_id'));

// Returns { deleted: true } or { deleted: false, reason: 'HAS_BOOKINGS' }.
const deleteCampaignWithoutHistory = async (campaign) => {
    if (await hasBookingHistory(campaign._id)) {
        return { deleted: false, reason: 'HAS_BOOKINGS' };
    }

    const snapshot = campaign.toObject();

    await campaign.deleteOne();

    if (await hasBookingHistory(campaign._id)) {
        await Campaign.create(snapshot);
        return { deleted: false, reason: 'HAS_BOOKINGS' };
    }

    await Creative.deleteMany({ campaignId: campaign._id });

    return { deleted: true };
};

module.exports = {
    CAMPAIGN_HAS_BOOKINGS_MESSAGE,
    hasBookingHistory,
    deleteCampaignWithoutHistory,
};
