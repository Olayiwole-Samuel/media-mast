const mongoose = require('mongoose');

// An advertiser's subscription. Owner: a company (companyId) or an
// individual (userId with companyId null), the same way bookings are owned.
// It gives access while status is ACTIVE and the period hasn't ended;
// cancelAtPeriodEnd keeps it until then and stops it renewing.
const SubscriptionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        planCode: { type: String, required: true, uppercase: true, trim: true },
        planName: { type: String, required: true },
        interval: { type: String, enum: ['MONTHLY', 'ANNUAL'], required: true },
        price: { type: Number, min: 0, required: true },
        currency: { type: String, default: 'NGN' },
        status: { type: String, enum: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'REPLACED'], default: 'ACTIVE' },
        currentPeriodStart: { type: Date, required: true },
        currentPeriodEnd: { type: Date, required: true },
        cancelAtPeriodEnd: { type: Boolean, default: false },
        cancelledAt: { type: Date, default: null },
        // Payment for this period (stub provider until online payment is live)
        provider: { type: String, default: null },
        reference: { type: String, default: null },
        providerReference: { type: String, default: null },
        // Set when an admin assigned it (e.g. Enterprise at a custom price)
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

SubscriptionSchema.index({ companyId: 1, status: 1 });
SubscriptionSchema.index({ userId: 1, companyId: 1, status: 1 });

module.exports = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
