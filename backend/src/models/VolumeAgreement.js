const mongoose = require('mongoose');

// A media agency's volume discount with one media house, from their existing
// agreement. The agency enters it; it only applies once the media house
// confirms it (APPROVED). Any change by the agency needs confirming again.
const VolumeAgreementSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }, // the agency
        stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true },
        // Default % for this media house, and optional % per programme
        // (key = name|kind|start|end|size|colour: every length of a programme).
        percent: { type: Number, default: 0, min: 0, max: 90 },
        programmes: {
            type: [{
                _id: false,
                key: { type: String, required: true },
                name: { type: String, default: null },
                percent: { type: Number, min: 0, max: 90 },
            }],
            default: [],
        },
        status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
        agencyNote: { type: String, default: null, maxlength: 500 },   // e.g. "per our 2026 agreement, ref …"
        stationNote: { type: String, default: null, maxlength: 500 },  // the media house's reply
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

VolumeAgreementSchema.index({ companyId: 1, stationId: 1 }, { unique: true });
VolumeAgreementSchema.index({ stationId: 1, status: 1 });

module.exports = mongoose.models.VolumeAgreement || mongoose.model('VolumeAgreement', VolumeAgreementSchema);
