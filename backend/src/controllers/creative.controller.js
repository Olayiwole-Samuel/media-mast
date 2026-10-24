const mongoose = require('mongoose');
const Creative = require('../models/Creative');
const Campaign = require('../models/Campaign');
const AuditLog = require('../models/AuditLog');
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

// ── Creative link validation (E5) ──
// The creative flow is link-based: the client sends a URL, never file
// bytes, and the server does not fetch the URL (no SSRF surface). So the
// server validates the link's shape and the declared type against the
// schema, but cannot verify what the remote file actually is.
const CREATIVE_TYPES = Creative.schema.path('type').enumValues;
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

const SERVER_OWNED_CREATIVE_FIELDS = [
    'status',
    'approvedBy',
    'approvedAt',
    'uploadedBy',
    'uploadedAt',
    'version',
];

const validateCreativeInput = ({ name, description, type, url }) => {
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

    if (type !== undefined && (typeof type !== 'string' || !CREATIVE_TYPES.includes(type))) {
        return { error: `Type must be one of: ${CREATIVE_TYPES.join(', ')}` };
    }

    if (typeof url !== 'string') {
        return { error: 'URL must be text' };
    }

    const trimmedUrl = url.trim();
    let parsed = null;

    try {
        parsed = new URL(trimmedUrl);
    } catch {
        parsed = null;
    }

    if (
        !parsed ||
        !ALLOWED_URL_PROTOCOLS.includes(parsed.protocol) ||
        !parsed.hostname ||
        trimmedUrl.length > MAX_URL_LENGTH
    ) {
        return { error: 'URL must be a valid http(s) link' };
    }

    // Embedded credentials (https://user:pass@host) are refused rather
    // than stored and shown to everyone who can view the creative.
    if (parsed.username || parsed.password) {
        return { error: 'URL must not contain a username or password' };
    }

    return {
        name: name.trim(),
        description:
            typeof description === 'string' && description.trim()
                ? description.trim()
                : null,
        type: type || 'IMAGE',
        url: trimmedUrl,
    };
};

// ── UPLOAD CREATIVE ──
const uploadCreative = async (req, res) => {
    try {
        const { companyId } = advertiserOwner(req);
        const userId = req.user.id;

        const body = req.body || {};
        const {
            campaignId,
            name,
            description,
            type,
            url,
        } = body;

        if (!campaignId || !name || !url) {
            return res.status(400).json({
                success: false,
                message: 'Campaign ID, name, and URL are required',
            });
        }

        // ── Server-owned fields (same convention as the update endpoint) ──
        const serverOwned = SERVER_OWNED_CREATIVE_FIELDS.filter((field) =>
            Object.prototype.hasOwnProperty.call(body, field));

        if (serverOwned.length > 0) {
            return res.status(400).json({
                success: false,
                message: `These fields are set by the server and cannot be supplied: ${serverOwned.join(', ')}`,
            });
        }

        // ── File metadata ──
        // Creatives are links: the server never receives the file, so it
        // cannot know its real size or MIME type. Client-reported values
        // would be stored as if they were facts, so they are refused.
        if (
            (body.size !== undefined && body.size !== null) ||
            (body.mimeType !== undefined && body.mimeType !== null)
        ) {
            return res.status(400).json({
                success: false,
                message: 'File size and MIME type cannot be supplied for a creative link; the server does not receive the file.',
            });
        }

        const input = validateCreativeInput({ name, description, type, url });

        if (input.error) {
            return res.status(400).json({
                success: false,
                message: input.error,
            });
        }

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

        // campaignId is the one verified above; everything else is the
        // validated input or server-set. size/mimeType stay unknown (null).
        const creative = await Creative.create({
            campaignId: campaign._id,
            name: input.name,
            description: input.description,
            type: input.type,
            url: input.url,
            size: null,
            mimeType: null,
            status: 'PENDING',
            uploadedBy: userId,
            uploadedAt: new Date(),
        });

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPLOAD_CREATIVE',
            entityType: 'CREATIVE',
            entityId: creative._id,
            metadata: { name: creative.name, type: creative.type },
        });

        res.status(201).json({
            success: true,
            message: 'Creative uploaded successfully',
            data: creative,
        });

    } catch (error) {
        console.error('❌ Upload creative error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload creative',
        });
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

        await creative.deleteOne();

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
    updateCreative,
    deleteCreative,
    approveCreative,
    rejectCreative,
};