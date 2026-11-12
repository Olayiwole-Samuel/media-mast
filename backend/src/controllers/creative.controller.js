const mongoose = require('mongoose');
const Creative = require('../models/Creative');
const Campaign = require('../models/Campaign');
const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const uploads = require('../utils/fileUploads');
const { advertiserScope, advertiserOwner, ownsRecord } = require('../utils/advertiser');

// ── Load a creative and verify its campaign belongs to the caller (company or individual) ──
// Sends the error response and returns null when the request must stop.
// Ownership is checked by ownsRecord (utils/advertiser.js), which compares
// ids as strings.
const loadCompanyCreative = async (req, res, campaignFields) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        res.status(400).json({
            success: false,
            message: 'Invalid creative ID',
        });
        return null;
    }

    const creative = await Creative.findById(id)
        .populate('campaignId', `${campaignFields} companyId userId`);

    if (!creative) {
        res.status(404).json({
            success: false,
            message: 'Creative not found',
        });
        return null;
    }

    // Campaign deleted / unresolvable: owned by no one
    if (!creative.campaignId) {
        res.status(404).json({
            success: false,
            message: 'Campaign not found for this creative',
        });
        return null;
    }

    // Verify the creative's campaign belongs to this advertiser
    if (!ownsRecord(req, creative.campaignId)) {
        res.status(403).json({
            success: false,
            message: 'Access denied',
        });
        return null;
    }

    return creative;
};

// ── GET CREATIVES BY CAMPAIGN ──
const getCreativesByCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { companyId } = advertiserOwner(req);

        if (!mongoose.isValidObjectId(campaignId)) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        // Verify campaign belongs to company
        const campaign = await Campaign.findOne({
            _id: campaignId,
            ...advertiserScope(req),
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        const creatives = await Creative.find({ campaignId: campaignId })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: creatives,
        });

    } catch (error) {
        console.error('❌ Get creatives error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load creatives',
        });
    }
};

// ── GET SINGLE CREATIVE ──
const getCreative = async (req, res) => {
    try {
        const creative = await loadCompanyCreative(req, res, 'name companyId');
        if (!creative) return;

        res.json({
            success: true,
            data: creative,
        });

    } catch (error) {
        console.error('❌ Get creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load creative',
        });
    }
};

// ── Creative upload: the advert file itself, plus its ARCON certificate ──
// Adverts are uploaded to Media Masters (no links): the station airs exactly
// the file the advertiser paid to place. Every advert carries its ARCON
// (Advertising Regulatory Council of Nigeria) pre-exposure approval: the
// certificate number and a copy of the certificate. Both files are sent
// first through /uploads (in parts), then attached here by their upload IDs.
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const CREATIVE_BUCKET = 'creatives';

const SERVER_OWNED_CREATIVE_FIELDS = [
    'status',
    'approvedBy',
    'approvedAt',
    'uploadedBy',
    'uploadedAt',
    'version',
    'fileId',
    'arcon',
];

const typeFromContentType = (contentType) => {
    const t = String(contentType || '');
    if (t.startsWith('video/')) return 'VIDEO';
    if (t.startsWith('audio/')) return 'AUDIO';
    if (t.startsWith('image/')) return 'IMAGE';
    return 'OTHER';
};

const ARCON_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ./\-]{3,59}$/;

const validateCreativeInput = ({ name, description, durationSeconds, arconCertificateNumber }) => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
        return { error: `Name must be text of 1–${MAX_NAME_LENGTH} characters` };
    }
    if (
        description !== undefined &&
        description !== null &&
        (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)
    ) {
        return { error: `Description must be text of at most ${MAX_DESCRIPTION_LENGTH} characters` };
    }
    if (typeof arconCertificateNumber !== 'string' || !ARCON_NUMBER.test(arconCertificateNumber.trim())) {
        return { error: 'Enter the ARCON approval certificate number for this advert' };
    }
    let seconds = null;
    if (durationSeconds !== undefined && durationSeconds !== null && durationSeconds !== '') {
        seconds = Number(durationSeconds);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
            return { error: 'Advert length must be a whole number of seconds (1–3600)' };
        }
    }
    return {
        name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        durationSeconds: seconds,
        arconCertificateNumber: arconCertificateNumber.trim().toUpperCase(),
    };
};

// Whoever may approve creatives (owner, ALL_ACCESS, CREATIVE_APPROVE) has
// their own uploads approved at once; other team members' uploads wait.
const canApproveCreatives = (req) => {
    if (req.user.accountType === 'COMPANY' || req.user.accountType === 'INDIVIDUAL') return true;
    const perms = req.employee?.permissions || [];
    return perms.includes('ALL_ACCESS') || perms.includes('CREATIVE_APPROVE');
};

// ── UPLOAD CREATIVE ──
const uploadCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);
        const userId = req.user.id;
        const body = req.body || {};
        const { campaignId, name, description, durationSeconds, uploadId, arconCertificateNumber, arconUploadId } = body;

        if (body.url !== undefined) {
            return res.status(400).json({
                success: false,
                message: 'Links are not accepted. Upload the advert file itself.',
            });
        }

        const serverOwned = SERVER_OWNED_CREATIVE_FIELDS.filter((field) =>
            Object.prototype.hasOwnProperty.call(body, field));
        if (serverOwned.length > 0) {
            return res.status(400).json({
                success: false,
                message: `These fields are set by the server and cannot be supplied: ${serverOwned.join(', ')}`,
            });
        }

        if (!campaignId || !name || !uploadId) {
            return res.status(400).json({
                success: false,
                message: 'Campaign, name and the advert file are required',
            });
        }
        if (!arconUploadId) {
            return res.status(400).json({
                success: false,
                message: 'Attach the ARCON approval certificate for this advert',
            });
        }

        const input = validateCreativeInput({ name, description, durationSeconds, arconCertificateNumber });
        if (input.error) {
            return res.status(400).json({ success: false, message: input.error });
        }

        if (!mongoose.isValidObjectId(campaignId)) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        const campaign = await Campaign.findOne({ _id: campaignId, ...advertiserScope(req) });
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const media = await uploads.claimUpload(req.user, uploadId, 'CREATIVE');
        if (media.error) return res.status(400).json({ success: false, message: `Advert file: ${media.error}` });
        const certificate = await uploads.claimUpload(req.user, arconUploadId, 'ARCON');
        if (certificate.error) {
            await uploads.deleteFile(CREATIVE_BUCKET, media.file.fileId);
            return res.status(400).json({ success: false, message: `ARCON certificate: ${certificate.error}` });
        }

        const approveNow = canApproveCreatives(req);
        const creative = await Creative.create({
            campaignId: campaign._id,
            name: input.name,
            description: input.description,
            type: typeFromContentType(media.file.contentType),
            fileId: media.file.fileId,
            fileName: media.file.name,
            url: null,
            size: media.file.size,
            mimeType: media.file.contentType,
            durationSeconds: input.durationSeconds,
            arcon: {
                certificateNumber: input.arconCertificateNumber,
                fileId: certificate.file.fileId,
                fileName: certificate.file.name,
                contentType: certificate.file.contentType,
            },
            status: approveNow ? 'APPROVED' : 'PENDING',
            approvedAt: approveNow ? new Date() : null,
            approvedBy: approveNow ? String(userId) : null,
            uploadedBy: userId,
            uploadedAt: new Date(),
        });

        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPLOAD_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name, type: creative.type, arcon: input.arconCertificateNumber },
        });

        res.status(201).json({
            success: true,
            message: approveNow ? 'Advert uploaded and ready to book' : 'Advert uploaded; waiting for approval in your team',
            data: creative,
        });
    } catch (error) {
        console.error('❌ Upload creative error:', error.name, error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to upload creative',
        });
    }
};

// ── CREATIVE FILE (play / download the advert or its ARCON certificate) ──
const getCreativeFile = async (req, res) => {
    try {
        const creative = await loadCompanyCreative(req, res, 'companyId');
        if (!creative) return;
        const which = req.query.which === 'arcon' ? 'arcon' : 'media';
        const fileId = which === 'arcon' ? creative.arcon?.fileId : creative.fileId;
        if (!fileId) return res.status(404).json({ success: false, message: 'No file stored for this creative' });
        return uploads.sendFile(res, CREATIVE_BUCKET, fileId, { download: req.query.download === '1' });
    } catch (error) {
        console.error('❌ Creative file error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not load the file' });
    }
};

// ── UPDATE CREATIVE ──
const updateCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);

        const creative = await loadCompanyCreative(req, res, 'companyId');
        if (!creative) return;

        const body = req.body || {};

        // Workflow status is changed only by the dedicated approve/reject
        // endpoints (CREATIVE_APPROVE). Reject the whole request, before any
        // field is touched, so nothing is partially applied or audited.
        if (Object.prototype.hasOwnProperty.call(body, 'status')) {
            return res.status(400).json({
                success: false,
                message: 'Creative status cannot be changed through this endpoint.',
            });
        }

        // Editable content only (explicit allowlist).
        const { name, description } = body;

        let hasChanges = false;
        if (name && name !== creative.name) {
            creative.name = name;
            hasChanges = true;
        }
        if (description !== undefined && description !== creative.description) {
            creative.description = description;
            hasChanges = true;
        }

        if (!hasChanges) {
            return res.status(400).json({
                success: false,
                message: 'No changes to update',
            });
        }

        await creative.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPDATE_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name },
        });

        res.json({
            success: true,
            message: 'Creative updated successfully',
            data: creative,
        });

    } catch (error) {
        console.error('❌ Update creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update creative',
        });
    }
};

// ── DELETE CREATIVE ──
const deleteCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);

        const creative = await loadCompanyCreative(req, res, 'companyId');
        if (!creative) return;

        // A station may still need it for a booked spot.
        const inUse = await Booking.exists({ creativeId: creative._id, status: { $nin: ['CANCELLED', 'REJECTED'] } });
        if (inUse) {
            return res.status(409).json({
                success: false,
                message: 'This advert is attached to booked spots, so it cannot be deleted.',
            });
        }

        await creative.deleteOne();
        if (creative.fileId) await uploads.deleteFile(CREATIVE_BUCKET, creative.fileId);
        if (creative.arcon?.fileId) await uploads.deleteFile(CREATIVE_BUCKET, creative.arcon.fileId);

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'DELETE_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name },
        });

        res.json({
            success: true,
            message: 'Creative deleted successfully',
        });

    } catch (error) {
        console.error('❌ Delete creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete creative',
        });
    }
};

// ── APPROVE CREATIVE ──
const approveCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);

        const creative = await loadCompanyCreative(req, res, 'companyId');
        if (!creative) return;

        creative.status = 'APPROVED';
        creative.approvedAt = new Date();
        creative.approvedBy = req.user.id;
        await creative.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'APPROVE_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name },
        });

        res.json({
            success: true,
            message: 'Creative approved successfully',
            data: creative,
        });

    } catch (error) {
        console.error('❌ Approve creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve creative',
        });
    }
};

// ── REJECT CREATIVE ──
const rejectCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);

        const creative = await loadCompanyCreative(req, res, 'companyId');
        if (!creative) return;

        creative.status = 'REJECTED';
        await creative.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'REJECT_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name },
        });

        res.json({
            success: true,
            message: 'Creative rejected successfully',
            data: creative,
        });

    } catch (error) {
        console.error('❌ Reject creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject creative',
        });
    }
};

module.exports = {
    getCreativesByCampaign,
    getCreative,
    uploadCreative,
    getCreativeFile,
    updateCreative,
    deleteCreative,
    approveCreative,
    rejectCreative,
};