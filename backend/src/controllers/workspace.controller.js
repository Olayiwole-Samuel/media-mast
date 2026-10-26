const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');

// GET /company/workspace — the signed-in team member's own work: their
// role and permissions, the campaigns they created, the spots they booked
// and what airs next. Needs no extra permission: everything is their own.

const ACTIVE_CAMPAIGN = ['SUBMITTED', 'PAYMENT_PENDING', 'PAYMENT_SUCCESSFUL', 'BOOKING_REQUESTS_SENT', 'MEDIA_REVIEW', 'ACCEPTED', 'CREATIVE_APPROVED', 'SCHEDULED', 'LIVE'];
const UPCOMING_BOOKING = ['PENDING', 'ACCEPTED', 'SCHEDULED'];

const getWorkspace = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(String(req.user._id || req.user.id));
        const companyId = req.company._id;

        const fullEmployee = await Employee.findOne({ userId, companyId, isActive: true })
            .select('position permissions departmentId');
        const department = fullEmployee?.departmentId
            ? await Department.findOne({ _id: fullEmployee.departmentId, companyId }).select('name')
            : null;

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const [campaignCounts, bookingCounts, spendRows, upcoming, recentCampaigns] = await Promise.all([
            Campaign.aggregate([
                { $match: { companyId, userId } },
                { $group: { _id: '$status', n: { $sum: 1 } } },
            ]),
            Booking.aggregate([
                { $match: { companyId, userId } },
                { $group: { _id: '$status', n: { $sum: 1 } } },
            ]),
            Booking.aggregate([
                { $match: { companyId, userId, paymentStatus: 'PAID' } },
                { $group: { _id: '$currency', total: { $sum: '$price' } } },
            ]),
            Booking.find({ companyId, userId, status: { $in: UPCOMING_BOOKING }, date: { $gte: today } })
                .sort({ date: 1, time: 1 })
                .limit(5)
                .select('bookingReference date time duration slot status rateName stationId campaignId')
                .populate('stationId', 'name type')
                .populate('campaignId', 'name'),
            Campaign.find({ companyId, userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('name status startDate endDate budget currency createdAt'),
        ]);

        const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
        const campaigns = byStatus(campaignCounts);
        const bookings = byStatus(bookingCounts);
        const sum = (obj, keys) => keys.reduce((t, k) => t + (obj[k] || 0), 0);

        return res.json({
            success: true,
            data: {
                me: {
                    name: req.user.name,
                    email: req.user.email,
                    isOwner: req.user.accountType === 'COMPANY',
                    position: fullEmployee?.position || (req.user.accountType === 'COMPANY' ? 'Company Owner' : 'Team Member'),
                    department: department?.name || null,
                    permissions: fullEmployee?.permissions || [],
                },
                company: { name: req.company.name, status: req.company.status },
                stats: {
                    campaignsTotal: Object.values(campaigns).reduce((t, n) => t + n, 0),
                    campaignsActive: sum(campaigns, ACTIVE_CAMPAIGN),
                    campaignsDraft: campaigns.DRAFT || 0,
                    bookingsTotal: Object.values(bookings).reduce((t, n) => t + n, 0),
                    bookingsPending: bookings.PENDING || 0,
                    bookingsScheduled: sum(bookings, ['ACCEPTED', 'SCHEDULED']),
                    bookingsCompleted: bookings.COMPLETED || 0,
                    spend: spendRows.map((r) => ({ currency: r._id || 'NGN', amount: r.total })),
                },
                upcoming: upcoming.map((b) => ({
                    _id: b._id,
                    reference: b.bookingReference,
                    date: b.date,
                    time: b.time,
                    duration: b.duration,
                    slot: b.slot,
                    status: b.status,
                    rateName: b.rateName || null,
                    station: b.stationId ? { name: b.stationId.name, type: b.stationId.type } : null,
                    campaign: b.campaignId ? b.campaignId.name : null,
                })),
                recentCampaigns,
            },
        });
    } catch (error) {
        console.error('❌ Workspace error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your workspace' });
    }
};

module.exports = { getWorkspace };
