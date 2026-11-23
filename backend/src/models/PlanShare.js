const mongoose = require('mongoose');

// A link an agency sends its client to review a saved plan (no account
// needed). The client approves it or asks for changes; the agency sees it.
const PlanShareSchema = new mongoose.Schema(
    {
        token: { type: String, required: true, unique: true },
        draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanDraft', required: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decision: { type: String, enum: ['APPROVED', 'CHANGES_REQUESTED', null], default: null },
        responderName: { type: String, default: null, maxlength: 80 },
        comment: { type: String, default: null, maxlength: 1000 },
        respondedAt: { type: Date, default: null },
        history: {
            type: [{ _id: false, decision: String, name: String, comment: String, at: Date }],
            default: [],
        },
    },
    { timestamps: true }
);

PlanShareSchema.index({ draftId: 1 });

module.exports = mongoose.models.PlanShare || mongoose.model('PlanShare', PlanShareSchema);
