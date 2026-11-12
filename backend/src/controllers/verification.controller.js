const mongoose = require('mongoose');
const Joi = require('joi');
const Verification = require('../models/Verification');
const { DOCUMENT_KINDS } = require('../models/Verification');
const User = require('../models/User');
const Company = require('../models/Company');
const Station = require('../models/Station');
const AuditLog = require('../models/AuditLog');
const uploads = require('../utils/fileUploads');
const { validateRateCard } = require('../validators/station.validator');
const { sendValidationErrors, joiFieldErrors, JOI_VALIDATE_OPTIONS } = require('../utils/validationResponse');
const {
    notifyVerificationSubmitted,
    notifyVerificationDecision,
    notifyNewStation,
    resolveNotifications,
} = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// VERIFICATION — a new business proves who it is before using the platform
//
// Business (signed in while PENDING):
//   GET    /verification                       record + what is still needed
//   PUT    /verification                       CAC number, TIN, ARCON no., address
//   POST   /verification/documents             attach an uploaded file { kind, uploadId }
//   DELETE /verification/documents/:docId
//   GET    /verification/documents/:docId/file
//   PUT    /verification/rate-card             media house: its rates (priced bookings)
//   POST   /verification/submit                send for review
//
// Admin:
//   GET  /admin/verifications?status=SUBMITTED
//   GET  /admin/verifications/:id
//   GET  /admin/verifications/:id/documents/:docId/file
//   POST /admin/verifications/:id/approve
//   POST /admin/verifications/:id/reject      { reason }
// ─────────────────────────────────────────────────────────────

const BUCKET = 'verification';

// What each kind of business must provide.
const REQUIREMENTS = {
    CLIENT: {
        documents: ['CAC_CERTIFICATE'],
        optionalDocuments: ['TAX_CERTIFICATE'],
        needsRates: false,
    },
    AGENCY: {
        documents: ['CAC_CERTIFICATE'],
        optionalDocuments: ['TAX_CERTIFICATE', 'ARCON_CERTIFICATE'],
        needsRates: false,
    },
    MEDIA_HOUSE: {
        documents: ['CAC_CERTIFICATE', 'RATE_CARD'],
        optionalDocuments: ['TAX_CERTIFICATE', 'BROADCAST_LICENCE'],
        needsRates: true,
    },
};

const EDITABLE = ['DRAFT', 'REJECTED'];

const detailsSchema = Joi.object({
    businessName: Joi.string().trim().min(2).max(150).required().messages({
        'any.required': 'Enter your registered business name',
        'string.empty': 'Enter your registered business name',
    }),
    // CAC: RC 1234567 (company), BN 1234567 (business name), IT 12345 (trustees)
    registrationNumber: Joi.string().trim().uppercase()
        .pattern(/^(RC|BN|IT|LP|LLP)?[\s-]?\d{4,9}$/)
        .required()
        .messages({
            'any.required': 'Enter your CAC registration number',
            'string.empty': 'Enter your CAC registration number',
            'string.pattern.base': 'Use your CAC number, e.g. RC 1234567 or BN 1234567',
        }),
    taxId: Joi.string().trim()
        .pattern(/^\d{8}-?\d{4}$|^\d{10,13}$/)
        .required()
        .messages({
            'any.required': 'Enter your Tax Identification Number (TIN)',
            'string.empty': 'Enter your Tax Identification Number (TIN)',
            'string.pattern.base': 'Use your TIN, e.g. 12345678-0001 or a 10–13 digit tax ID',
        }),
    arconNumber: Joi.string().trim().max(40).allow('').default(''),
    address: Joi.string().trim().max(200).allow('').default(''),
    phone: Joi.string().trim().pattern(/^[0-9+\-\s()]{10,15}$/).allow('').default('')
        .messages({ 'string.pattern.base': 'Enter a valid phone number' }),
}).unknown(false);

const docPublic = (d) => ({ _id: d._id, kind: d.kind, name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt });

const stationSummary = (station) => station && ({
    _id: station._id,
    name: station.name,
    type: station.type,
    location: station.location,
    pricing: station.pricing,
    rateCard: station.rateCard || [],
    approvalStatus: station.approvalStatus,
});

// What is still missing before the record can be submitted.
const missingItems = (verification, station) => {
    const req = REQUIREMENTS[verification.accountKind];
    const missing = [];
    if (!verification.businessName) missing.push('Business name');
    if (!verification.registrationNumber) missing.push('CAC registration number');
    if (!verification.taxId) missing.push('Tax Identification Number (TIN)');
    const kinds = new Set(verification.documents.map((d) => d.kind));
    for (const k of req.documents) {
        if (!kinds.has(k)) missing.push(k === 'RATE_CARD' ? 'Rate card document' : 'CAC certificate');
    }
    if (req.needsRates && !(station?.rateCard || []).some((r) => r.isActive !== false)) {
        missing.push('Your rates (at least one) entered on the platform');
    }
    return missing;
};

const publicVerification = (verification, station) => ({
    _id: verification._id,
    accountKind: verification.accountKind,
    businessName: verification.businessName,
    registrationNumber: verification.registrationNumber,
    taxId: verification.taxId,
    arconNumber: verification.arconNumber,
    address: verification.address,
    phone: verification.phone,
    documents: verification.documents.map(docPublic),
    status: verification.status,
    reviewNote: verification.reviewNote,
    submittedAt: verification.submittedAt,
    reviewedAt: verification.reviewedAt,
    requirements: REQUIREMENTS[verification.accountKind],
    missing: missingItems(verification, station),
    station: stationSummary(station),
});

// A business that signed up before verification existed has no record yet:
// start one from its company (client/agency) or its station (media house),
// so it never lands on an empty page.
const startMissing = async (user) => {
    if (user.accountType === 'COMPANY' && user.companyId) {
        const company = await Company.findById(user.companyId).select('name companyType phone');
        if (!company) return null;
        return Verification.create({
            userId: user._id,
            accountKind: company.companyType === 'AGENCY' ? 'AGENCY' : 'CLIENT',
            companyId: company._id,
            businessName: company.name,
            phone: company.phone || '',
        });
    }
    if (user.accountType === 'STATION') {
        const station = await Station.findOne({ managerIds: user._id }).select('name phone');
        if (!station) return null;
        return Verification.create({
            userId: user._id,
            accountKind: 'MEDIA_HOUSE',
            stationId: station._id,
            businessName: station.name,
            phone: station.phone || '',
        });
    }
    return null;
};

const loadOwn = async (req) => {
    let verification = await Verification.findOne({ userId: req.user._id });
    if (!verification && req.user.status === 'PENDING') verification = await startMissing(req.user);
    const station = verification?.stationId ? await Station.findById(verification.stationId) : null;
    return { verification, station };
};

const notFound = (res) => res.status(404).json({
    success: false,
    message: 'There is no verification for this account.',
});

const locked = (res, verification) => res.status(409).json({
    success: false,
    message: verification.status === 'APPROVED'
        ? 'Your account is already verified.'
        : 'Your details are with our team for review. You can make changes if they ask for any.',
});

const audit = (req, action, verification, metadata = {}) =>
    AuditLog.create({
        userId: req.user._id,
        companyId: verification.companyId || null,
        action,
        entityType: 'VERIFICATION',
        entityId: verification._id,
        metadata: { accountKind: verification.accountKind, businessName: verification.businessName, ...metadata },
    }).catch((e) => console.error('⚠️ Verification audit failed:', e.name));

// ── Business side ──

const getMyVerification = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        return res.json({ success: true, data: publicVerification(verification, station) });
    } catch (error) {
        console.error('❌ Get verification error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your verification' });
    }
};

const updateMyVerification = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        if (!EDITABLE.includes(verification.status)) return locked(res, verification);

        const { error, value } = detailsSchema.validate(req.body || {}, JOI_VALIDATE_OPTIONS);
        if (error) return sendValidationErrors(res, joiFieldErrors(error));

        Object.assign(verification, value);
        await verification.save();
        return res.json({ success: true, message: 'Details saved', data: publicVerification(verification, station) });
    } catch (error) {
        console.error('❌ Update verification error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save your details' });
    }
};

const addMyDocument = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        if (!EDITABLE.includes(verification.status)) return locked(res, verification);

        const kind = String(req.body?.kind || '').toUpperCase();
        if (!DOCUMENT_KINDS.includes(kind)) {
            return res.status(400).json({ success: false, message: 'Choose what this document is' });
        }
        const claimed = await uploads.claimUpload(req.user, req.body?.uploadId, 'VERIFICATION');
        if (claimed.error) return res.status(400).json({ success: false, message: claimed.error });

        // One file per kind (except OTHER): a new one replaces the old.
        if (kind !== 'OTHER') {
            const old = verification.documents.filter((d) => d.kind === kind);
            verification.documents = verification.documents.filter((d) => d.kind !== kind);
            for (const d of old) await uploads.deleteFile(BUCKET, d.fileId);
        }
        verification.documents.push({
            kind,
            fileId: claimed.file.fileId,
            name: claimed.file.name,
            contentType: claimed.file.contentType,
            size: claimed.file.size,
        });
        await verification.save();
        return res.status(201).json({ success: true, message: 'Document added', data: publicVerification(verification, station) });
    } catch (error) {
        console.error('❌ Add verification document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to add the document' });
    }
};

const removeMyDocument = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        if (!EDITABLE.includes(verification.status)) return locked(res, verification);

        const doc = verification.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        await uploads.deleteFile(BUCKET, doc.fileId);
        doc.deleteOne();
        await verification.save();
        return res.json({ success: true, message: 'Document removed', data: publicVerification(verification, station) });
    } catch (error) {
        console.error('❌ Remove verification document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to remove the document' });
    }
};

const downloadMyDocument = async (req, res) => {
    try {
        const { verification } = await loadOwn(req);
        if (!verification) return notFound(res);
        const doc = verification.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        return uploads.sendFile(res, BUCKET, doc.fileId);
    } catch (error) {
        console.error('❌ Download verification document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Download failed' });
    }
};

// Media house: enter its rates while awaiting approval (bookings are priced from them).
const setMyRateCard = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        if (!station) return res.status(400).json({ success: false, message: 'Only a media house has a rate card' });
        if (!EDITABLE.includes(verification.status)) return locked(res, verification);

        const check = validateRateCard(req.body);
        if (check.errors) return sendValidationErrors(res, check.errors);

        station.rateCard = check.value.rates;
        await station.save();
        return res.json({ success: true, message: 'Rates saved', data: publicVerification(verification, station) });
    } catch (error) {
        console.error('❌ Verification rate card error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save your rates' });
    }
};

const submitMyVerification = async (req, res) => {
    try {
        const { verification, station } = await loadOwn(req);
        if (!verification) return notFound(res);
        if (!EDITABLE.includes(verification.status)) return locked(res, verification);

        const missing = missingItems(verification, station);
        if (missing.length) {
            return res.status(400).json({
                success: false,
                message: `Still needed: ${missing.join(', ')}`,
                data: { missing },
            });
        }

        verification.status = 'SUBMITTED';
        verification.submittedAt = new Date();
        await verification.save();
        await audit(req, 'SUBMIT_VERIFICATION', verification);
        await notifyVerificationSubmitted(verification);

        return res.json({
            success: true,
            message: 'Sent for review. We will let you know as soon as you are approved.',
            data: publicVerification(verification, station),
        });
    } catch (error) {
        console.error('❌ Submit verification error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to submit' });
    }
};

// ── Admin side ──

const ADMIN_LIST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

const adminRow = (v, user = v.userId) => ({
    _id: v._id,
    accountKind: v.accountKind,
    businessName: v.businessName,
    registrationNumber: v.registrationNumber,
    taxId: v.taxId,
    status: v.status,
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    documentCount: v.documents.length,
    user: user && user._id ? { _id: user._id, name: user.name, email: user.email } : null,
});

const listVerifications = async (req, res) => {
    try {
        const status = String(req.query.status || 'SUBMITTED').toUpperCase();
        const filter = ADMIN_LIST_STATUSES.includes(status) ? { status } : {};
        const rows = await Verification.find(filter)
            .sort({ submittedAt: 1, createdAt: -1 })
            .limit(200)
            .populate('userId', 'name email');
        const counts = await Verification.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
        return res.json({
            success: true,
            data: rows.map(adminRow),
            counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
        });
    } catch (error) {
        console.error('❌ List verifications error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load verifications' });
    }
};

const loadForAdmin = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid verification ID' });
        return null;
    }
    const verification = await Verification.findById(req.params.id);
    if (!verification) {
        res.status(404).json({ success: false, message: 'Verification not found' });
        return null;
    }
    // The account the record belongs to (loaded separately; the record keeps its id).
    verification.account = await User.findById(verification.userId).select('name email status accountType');
    return verification;
};

const getVerification = async (req, res) => {
    try {
        const verification = await loadForAdmin(req, res);
        if (!verification) return undefined;
        const station = verification.stationId ? await Station.findById(verification.stationId) : null;
        const company = verification.companyId ? await Company.findById(verification.companyId).select('name email phone status companyType') : null;
        return res.json({
            success: true,
            data: {
                ...publicVerification(verification, station),
                user: verification.account ? { _id: verification.account._id, name: verification.account.name, email: verification.account.email } : null,
                company,
            },
        });
    } catch (error) {
        console.error('❌ Get verification (admin) error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load the verification' });
    }
};

const downloadVerificationDocument = async (req, res) => {
    try {
        const verification = await loadForAdmin(req, res);
        if (!verification) return undefined;
        const doc = verification.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        return uploads.sendFile(res, BUCKET, doc.fileId);
    } catch (error) {
        console.error('❌ Download verification document (admin) error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Download failed' });
    }
};

const approveVerification = async (req, res) => {
    try {
        const verification = await loadForAdmin(req, res);
        if (!verification) return undefined;
        if (verification.status !== 'SUBMITTED') {
            return res.status(409).json({ success: false, message: `Only submitted verifications can be approved (this one is ${verification.status.toLowerCase()})` });
        }
        const userId = verification.userId;

        let station = null;
        if (verification.accountKind === 'MEDIA_HOUSE') {
            station = await Station.findById(verification.stationId);
            if (!station) return res.status(404).json({ success: false, message: 'Media house station not found' });
            if (!(station.rateCard || []).some((r) => r.isActive !== false)) {
                return res.status(400).json({ success: false, message: 'This media house has no rates yet; reject it and ask for its rates.' });
            }
            station.approvalStatus = 'APPROVED';
            station.isActive = true;
            await station.save();
        } else {
            await Company.updateOne({ _id: verification.companyId }, { $set: { status: 'APPROVED' } });
        }
        await User.updateOne({ _id: userId, status: 'PENDING' }, { $set: { status: 'ACTIVE' } });

        verification.status = 'APPROVED';
        verification.reviewNote = null;
        verification.reviewedAt = new Date();
        verification.reviewedBy = req.user._id;
        await verification.save();

        await audit(req, 'APPROVE_VERIFICATION', verification);
        await resolveNotifications(`verification:${verification._id}`);
        await notifyVerificationDecision(verification, verification.account, true);
        if (station) await notifyNewStation(station);

        return res.json({ success: true, message: `${verification.businessName || 'Account'} approved`, data: adminRow(verification, verification.account) });
    } catch (error) {
        console.error('❌ Approve verification error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to approve' });
    }
};

const rejectVerification = async (req, res) => {
    try {
        const verification = await loadForAdmin(req, res);
        if (!verification) return undefined;
        if (verification.status !== 'SUBMITTED') {
            return res.status(409).json({ success: false, message: `Only submitted verifications can be rejected (this one is ${verification.status.toLowerCase()})` });
        }
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 5 || reason.length > 500) {
            return res.status(400).json({ success: false, message: 'Tell the business what to fix (5–500 characters)' });
        }

        // The account stays PENDING: it can fix its details and submit again.
        verification.status = 'REJECTED';
        verification.reviewNote = reason;
        verification.reviewedAt = new Date();
        verification.reviewedBy = req.user._id;
        await verification.save();

        await audit(req, 'REJECT_VERIFICATION', verification, { reason });
        await resolveNotifications(`verification:${verification._id}`);
        await notifyVerificationDecision(verification, verification.account, false);

        return res.json({ success: true, message: 'Sent back with your note', data: adminRow(verification, verification.account) });
    } catch (error) {
        console.error('❌ Reject verification error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to reject' });
    }
};

module.exports = {
    REQUIREMENTS,
    getMyVerification,
    updateMyVerification,
    addMyDocument,
    removeMyDocument,
    downloadMyDocument,
    setMyRateCard,
    submitMyVerification,
    listVerifications,
    getVerification,
    downloadVerificationDocument,
    approveVerification,
    rejectVerification,
};
