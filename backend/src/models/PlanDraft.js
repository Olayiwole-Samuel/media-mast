const mongoose = require('mongoose');

// A media plan in the cart: saved as it is built, so nothing is lost when the
// advertiser leaves to fund the wallet. One per campaign per advertiser;
// checkout books it and deletes it.
const PlanDraftSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
        creativeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creative', default: null },
        // When the plan itself last changed (a client approval before this is out of date).
        changedAt: { type: Date, default: Date.now },
        lines: {
            type: [{
                _id: false,
                stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true },
                rateId: { type: mongoose.Schema.Types.ObjectId, required: true },
                // Spots for each weekday, Sunday first: [Sun, Mon, …, Sat].
                spotsByDay: { type: [Number], default: [0, 0, 0, 0, 0, 0, 0] },
                startDate: { type: String, default: null }, // YYYY-MM-DD, inside the campaign
                endDate: { type: String, default: null },
                // Weeks switched off (Monday YYYY-MM-DD), for bursts and quiet weeks.
                offWeeks: { type: [String], default: [] },
            }],
            default: [],
        },
    },
    { timestamps: true }
);

PlanDraftSchema.index({ campaignId: 1, userId: 1, companyId: 1 }, { unique: true });

module.exports = mongoose.models.PlanDraft || mongoose.model('PlanDraft', PlanDraftSchema);
