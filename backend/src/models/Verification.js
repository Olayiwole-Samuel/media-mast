const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// ACCOUNT VERIFICATION
//
// Every new business (media client, media agency, media house) proves who it
// is before it can use Media Masters: CAC registration number, tax ID (TIN)
// and supporting documents; a media house also sends its rate card. The
// account can sign in while PENDING but only reaches its verification page
// until an admin approves this record.
//
//   DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED
//                         │
//                         └──reject (reason)──▶ REJECTED ──edit + submit──▶ SUBMITTED
// ─────────────────────────────────────────────────────────────

const DOCUMENT_KINDS = ['CAC_CERTIFICATE', 'TAX_CERTIFICATE', 'ARCON_CERTIFICATE', 'RATE_CARD', 'BROADCAST_LICENCE', 'OTHER'];

const VerificationDocumentSchema = new mongoose.Schema(
    {
        kind: { type: String, enum: DOCUMENT_KINDS, required: true },
        fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true, trim: true, maxlength: 150 },
        contentType: { type: String, default: null },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const VerificationSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        accountKind: { type: String, enum: ['CLIENT', 'AGENCY', 'MEDIA_HOUSE'], required: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', default: null },

        businessName: { type: String, trim: true, maxlength: 150, default: '' },
        registrationNumber: { type: String, trim: true, maxlength: 30, default: '' },
        taxId: { type: String, trim: true, maxlength: 30, default: '' },
        arconNumber: { type: String, trim: true, maxlength: 40, default: '' },
        address: { type: String, trim: true, maxlength: 200, default: '' },
        phone: { type: String, trim: true, maxlength: 20, default: '' },

        documents: { type: [VerificationDocumentSchema], default: [] },

        status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'], default: 'DRAFT' },
        reviewNote: { type: String, trim: true, maxlength: 500, default: null },
        submittedAt: { type: Date, default: null },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

VerificationSchema.index({ status: 1, submittedAt: 1 });

module.exports = mongoose.model('Verification', VerificationSchema);
module.exports.DOCUMENT_KINDS = DOCUMENT_KINDS;
