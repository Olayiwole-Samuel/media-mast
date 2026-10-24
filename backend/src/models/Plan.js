const mongoose = require('mongoose');

// A subscription plan advertisers can buy monthly or annually. Defaults are
// created on first use (utils/subscriptions.js); admins edit them after.
// Limits: null = unlimited.
const PlanSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        description: { type: String, trim: true, maxlength: 300, default: '' },
        // null = priced on request (assigned by an admin, e.g. Enterprise)
        monthlyPrice: { type: Number, min: 0, default: null },
        annualPrice: { type: Number, min: 0, default: null },
        currency: { type: String, default: 'NGN', uppercase: true, trim: true },
        maxActiveCampaigns: { type: Number, min: 1, default: null },
        storageMB: { type: Number, min: 0, default: 0 },
        discountPercent: { type: Number, min: 0, max: 30, default: 0 },
        teamSeats: { type: Number, min: 1, default: null },
        highlighted: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.models.Plan || mongoose.model('Plan', PlanSchema);
