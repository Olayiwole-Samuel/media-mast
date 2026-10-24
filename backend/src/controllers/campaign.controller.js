const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');
const Creative = require('../models/Creative');
const AuditLog = require('../models/AuditLog');
const {
    CAMPAIGN_HAS_BOOKINGS_MESSAGE,
    deleteCampaignWithoutHistory,
} = require('../utils/campaignDeletion');
const {
    isKnownCampaignStatus,
    canTransitionCampaignStatus,
} = require('../utils/campaignStatus');
const { isValidObjectId, invalidIdResponse } = require('../utils/objectId');
const { advertiserScope, advertiserOwner } = require('../utils/advertiser');
const { bookingHelpers } = require('./booking.controller');
const { airTimeOf } = require('../utils/cancellationPolicy');

// ── Budget rule: same as the Campaign schema (Number, min 0) ──
// Explicit checks, not truthiness: 0 is a valid budget, while strings,
// booleans, objects, arrays, NaN, ±Infinity and negatives are not.
// Returns an error message, or null when the value is valid.
const getBudgetError = (budget) => {
    if (typeof budget !== 'number' || !Number.isFinite(budget)) {
        return 'Budget must be a number';
    }

    if (budget < 0) {
        return 'Budget cannot be negative';
    }

    return null;
};

// ─────────────────────────────────────────────
// GET ALL CAMPAIGNS (company or individual advertiser)
// ─────────────────────────────────────────────
const getCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign.find(advertiserScope(req))
            .sort({ createdAt: -1 })
            .populate('userId', 'name email');

        res.json({
            success: true,
            data: campaigns,
        });

    } catch (error) {
        console.error('❌ Get campaigns error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to load campaigns',
        });
    }
};


// ─────────────────────────────────────────────
// GET SINGLE CAMPAIGN (company or individual advertiser)
// ─────────────────────────────────────────────
const getCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findOne({
            _id: id,
            ...advertiserScope(req),
        }).populate('userId', 'name email');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        // Get related bookings
        const bookings = await Booking.find({
            campaignId: campaign._id,
        }).populate(
            'stationId',
            'name type location approvalStatus inventoryStatus isActive'
        );

        // Get related creatives
        const creatives = await Creative.find({
            campaignId: campaign._id,
        });

        res.json({
            success: true,
            data: {
                ...campaign.toObject(),
                bookings,
                creatives,
            },
        });

    } catch (error) {
        console.error('❌ Get campaign error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to load campaign',
        });
    }
};


// ─────────────────────────────────────────────
// CREATE CAMPAIGN
// ─────────────────────────────────────────────
const createCampaign = async (req, res) => {
    try {
        const { companyId, userId } = advertiserOwner(req);

        const {
            name,
            description,
            objective,
            budget,
            currency,
            startDate,
            endDate,
        } = req.body;

        if (!name || budget === undefined || budget === null) {
            return res.status(400).json({
                success: false,
                message: 'Name and budget are required',
            });
        }

        const budgetError = getBudgetError(budget);

        if (budgetError) {
            return res.status(400).json({
                success: false,
                message: budgetError,
            });
        }

        const campaign = await Campaign.create({
            name,
            description,
            objective: objective || 'BRAND_AWARENESS',
            budget,
            currency: currency || 'NGN',
            startDate: startDate || null,
            endDate: endDate || null,
            companyId,
            userId,
            status: 'DRAFT',
        });

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'CREATE_CAMPAIGN',
            entityType: 'CAMPAIGN',
            entityId: campaign._id,
            metadata: {
                name: campaign.name,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Campaign created successfully',
            data: campaign,
        });

    } catch (error) {
        console.error('❌ Create campaign error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to create campaign',
        });
    }
};


// ─────────────────────────────────────────────
// UPDATE CAMPAIGN
// ─────────────────────────────────────────────
const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { companyId } = advertiserOwner(req);

        const campaign = await Campaign.findOne({
            _id: id,
            ...advertiserScope(req),
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        const updates = req.body;

        // `status` is intentionally NOT editable here. Status changes go
        // only through PATCH /:id/status, which enforces the transition
        // matrix in utils/campaignStatus.js.
        const allowedUpdates = [
            'name',
            'description',
            'objective',
            'budget',
            'currency',
            'startDate',
            'endDate',
        ];

        if (updates.budget !== undefined) {
            const budgetError = getBudgetError(updates.budget);

            if (budgetError) {
                return res.status(400).json({
                    success: false,
                    message: budgetError,
                });
            }
        }

        const appliedUpdates = {};

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                campaign[field] = updates[field];
                appliedUpdates[field] = updates[field];
            }
        });

        const hasChanges = Object.keys(appliedUpdates).length > 0;

        if (!hasChanges) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update',
            });
        }

        await campaign.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPDATE_CAMPAIGN',
            entityType: 'CAMPAIGN',
            entityId: campaign._id,
            metadata: {
                name: campaign.name,
                // Only fields actually applied, so ignored input (e.g. status)
                // is never recorded as a change.
                updates: appliedUpdates,
            },
        });

        res.json({
            success: true,
            message: 'Campaign updated successfully',
            data: campaign,
        });

    } catch (error) {
        console.error('❌ Update campaign error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to update campaign',
        });
    }
};


// ─────────────────────────────────────────────
// DELETE CAMPAIGN
// ─────────────────────────────────────────────
const deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { companyId } = advertiserOwner(req);

        if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid campaign ID',
            });
        }

        const campaign = await Campaign.findOne({
            _id: id,
            ...advertiserScope(req),
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        // Only DRAFT or CANCELLED campaigns can be deleted
        if (!['DRAFT', 'CANCELLED'].includes(campaign.status)) {
            return res.status(403).json({
                success: false,
                message: `Cannot delete campaign with status: ${campaign.status}`,
            });
        }

        // Booking history is never deleted: a campaign with any booking
        // is kept (409) and nothing is changed. Otherwise the campaign and
        // its creatives are removed (see utils/campaignDeletion.js).
        const result = await deleteCampaignWithoutHistory(campaign);

        if (!result.deleted) {
            return res.status(409).json({
                success: false,
                message: CAMPAIGN_HAS_BOOKINGS_MESSAGE,
            });
        }

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'DELETE_CAMPAIGN',
            entityType: 'CAMPAIGN',
            entityId: campaign._id,
            metadata: {
                name: campaign.name,
            },
        });

        res.json({
            success: true,
            message: 'Campaign deleted successfully',
        });

    } catch (error) {
        console.error('❌ Delete campaign error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to delete campaign',
        });
    }
};


// ─────────────────────────────────────────────
// UPDATE CAMPAIGN STATUS
// ─────────────────────────────────────────────
const updateCampaignStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { companyId } = advertiserOwner(req);
        const scope = advertiserScope(req);

        if (!isKnownCampaignStatus(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status',
            });
        }

        const campaign = await Campaign.findOne({
            _id: id,
            ...scope,
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        const oldStatus = campaign.status;

        if (!canTransitionCampaignStatus('CUSTOMER', oldStatus, status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid campaign status transition: ${oldStatus} → ${status}`,
            });
        }

        // ── Conditional write: only if the status is still what we validated ──
        const updatedCampaign = await Campaign.findOneAndUpdate(
            { _id: campaign._id, ...scope, status: oldStatus },
            { $set: { status } },
            { new: true, runValidators: true }
        );

        if (!updatedCampaign) {
            return res.status(409).json({
                success: false,
                message: 'Campaign status changed during this request. Please reload and try again.',
            });
        }

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPDATE_CAMPAIGN_STATUS',
            entityType: 'CAMPAIGN',
            entityId: campaign._id,
            metadata: {
                oldStatus,
                newStatus: status,
            },
        });

        res.json({
            success: true,
            message: `Campaign status updated from ${oldStatus} to ${status}`,
            data: updatedCampaign,
        });

    } catch (error) {
        console.error(
            '❌ Update campaign status error:',
            error
        );

        res.status(500).json({
            success: false,
            message: 'Failed to update campaign status',
        });
    }
};


// ─────────────────────────────────────────────
// CANCEL A CAMPAIGN (advertiser)
// Free before the campaign's first spot airs; once it is running, every
// spot that hasn't aired is refunded minus a 10–20% progress-based fee,
// and spots airing within 2 hours can't be cancelled
// (utils/cancellationPolicy.js). Spots that already aired stay paid.
// ─────────────────────────────────────────────
const CAMPAIGN_CLOSED = ['CANCELLED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'REFUNDED', 'FAILED'];

const loadOwnCampaign = async (req, res) => {
    const campaign = await Campaign.findOne({ _id: req.params.id, ...advertiserScope(req) });
    if (!campaign) {
        res.status(404).json({ success: false, message: 'Campaign not found' });
        return null;
    }
    return campaign;
};

const getCampaignCancellationQuote = async (req, res) => {
    try {
        const campaign = await loadOwnCampaign(req, res);
        if (!campaign) return undefined;

        const { items, totals, campaignBookings } = await bookingHelpers.quoteCampaignCancellation(campaign);
        const now = new Date();

        return res.json({
            success: true,
            data: {
                campaignStatus: campaign.status,
                cancellable: !CAMPAIGN_CLOSED.includes(campaign.status),
                totals,
                spotsAlreadyAired: campaignBookings.filter((b) => b.status === 'COMPLETED' || (!['REJECTED', 'CANCELLED'].includes(b.status) && airTimeOf(b) <= now)).length,
                items: items.map(({ booking, quote }) => ({
                    bookingId: booking._id,
                    bookingReference: booking.bookingReference,
                    station: booking.stationId?.name || null,
                    ...bookingHelpers.publicQuote(quote),
                })),
            },
        });
    } catch (error) {
        console.error('❌ Campaign cancellation quote error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to work out the cancellation' });
    }
};

const cancelCampaign = async (req, res) => {
    try {
        const campaign = await loadOwnCampaign(req, res);
        if (!campaign) return undefined;

        if (CAMPAIGN_CLOSED.includes(campaign.status)) {
            return res.status(400).json({ success: false, message: `This campaign is already ${campaign.status.toLowerCase()}.` });
        }

        const { outcomes, totals } = await bookingHelpers.cancelCampaignBookings(req, campaign);
        const failed = outcomes.filter((o) => o.status !== 200);
        const refundAmount = Math.round(outcomes.reduce((sum, o) => sum + o.refundAmount, 0) * 100) / 100;
        const fee = Math.round(outcomes.reduce((sum, o) => sum + o.fee, 0) * 100) / 100;

        const updated = await Campaign.findOneAndUpdate(
            { _id: campaign._id, ...advertiserScope(req), status: { $nin: CAMPAIGN_CLOSED } },
            { $set: { status: 'CANCELLED' } },
            { new: true }
        );

        try {
            await AuditLog.create({
                userId: req.user.id,
                companyId: advertiserOwner(req).companyId,
                action: 'UPDATE_CAMPAIGN_STATUS',
                entityType: 'CAMPAIGN',
                entityId: campaign._id,
                metadata: {
                    oldStatus: campaign.status,
                    newStatus: 'CANCELLED',
                    cancelledSpots: outcomes.length - failed.length,
                    refundAmount,
                    fee,
                },
            });
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError.name, auditError.message);
        }

        return res.json({
            success: failed.length === 0,
            message: failed.length
                ? `Campaign cancelled, but ${failed.length} spot(s) could not be cancelled. Please review them.`
                : 'Campaign cancelled',
            data: {
                campaign: updated || campaign,
                outcomes,
                quotedTotals: totals,
                refundAmount,
                fee,
            },
        });
    } catch (error) {
        console.error('❌ Cancel campaign error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to cancel campaign' });
    }
};

// ─────────────────────────────────────────────
// GET ALL CAMPAIGNS (Admin)
// ─────────────────────────────────────────────
const getAdminCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign.find({})
            .sort({ createdAt: -1 })
            .populate(
                'userId',
                'name email accountType'
            )
            .populate(
                'companyId',
                'name email phone logo status'
            );

        res.json({
            success: true,
            data: campaigns,
        });

    } catch (error) {
        console.error(
            '❌ Admin get campaigns error:',
            error
        );

        res.status(500).json({
            success: false,
            message: 'Failed to load campaigns',
        });
    }
};


// ─────────────────────────────────────────────
// GET SINGLE CAMPAIGN (Admin)
// ─────────────────────────────────────────────
const getAdminCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        // Mounted under /admin (not this file's router), so no router.param here.
        if (!isValidObjectId(id)) {
            return invalidIdResponse(res, 'campaign');
        }

        const campaign = await Campaign.findById(id)
            .populate(
                'userId',
                'name email accountType'
            )
            .populate(
                'companyId',
                'name email phone logo status'
            );

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        // Get related bookings
        const bookings = await Booking.find({
            campaignId: campaign._id,
        }).populate(
            'stationId',
            'name type location approvalStatus inventoryStatus isActive'
        );

        // Get related creatives
        const creatives = await Creative.find({
            campaignId: campaign._id,
        });

        res.json({
            success: true,
            data: {
                ...campaign.toObject(),
                bookings,
                creatives,
            },
        });

    } catch (error) {
        console.error(
            '❌ Admin get campaign error:',
            error
        );

        res.status(500).json({
            success: false,
            message: 'Failed to load campaign',
        });
    }
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
    getCampaigns,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    updateCampaignStatus,
    getCampaignCancellationQuote,
    cancelCampaign,
    getAdminCampaigns,
    getAdminCampaign,
};