const Company = require('../models/Company');
const Employee = require('../models/Employee');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');
const Creative = require('../models/Creative');
const {
    validateCompanySettings,
    validateLogo,
} = require('../validators/settings.validator');

const { sendValidationErrors } = require('../utils/validationResponse');

const companyEmailTaken = (res) =>
    res.status(409).json({
        success: false,
        message: 'A company with this email already exists',
    });

// ── GET COMPANY SETTINGS ──
const getCompanySettings = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        const company = await Company.findById(companyId);

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found',
            });
        }

        // Get employee count
        const employeeCount = await Employee.countDocuments({
            companyId: companyId,
            isActive: true,
        });

        res.json({
            success: true,
            data: {
                id: company._id,
                name: company.name,
                slug: company.slug,
                email: company.email,
                phone: company.phone,
                logo: company.logo,
                website: company.website,
                description: company.description,
                address: company.address,
                city: company.city,
                state: company.state,
                country: company.country,
                status: company.status,
                timezone: company.timezone,
                currency: company.currency,
                employeeCount: employeeCount,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
            },
        });

    } catch (error) {
        console.error('❌ Get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load company settings',
        });
    }
};

// ── UPDATE COMPANY SETTINGS ──
const updateCompanySettings = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        const company = await Company.findById(companyId);

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found',
            });
        }

        // Only the validated, allowlisted fields can reach the document;
        // unknown/read-only keys, operators and wrong types are a 400.
        const settings = validateCompanySettings(req.body);

        if (settings.errors) {
            return sendValidationErrors(res, settings.errors);
        }

        // Track changes for audit log
        const changes = {};

        for (const [field, value] of Object.entries(settings.value)) {
            if (value !== company[field]) {
                changes[field] = { old: company[field], new: value };
                company[field] = value;
            }
        }

        // Company.email is unique: refuse a taken address with 409 instead of
        // letting the unique index fail the save as a 500.
        if (changes.email) {
            const emailOwner = await Company.findOne({
                email: changes.email.new,
                _id: { $ne: company._id },
            }).select('_id');

            if (emailOwner) {
                return companyEmailTaken(res);
            }
        }

        if (Object.keys(changes).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No changes to update',
            });
        }

        await company.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPDATE_COMPANY',
            entityType: 'COMPANY',
            entityId: company._id,
            metadata: { changes },
        });

        res.json({
            success: true,
            message: 'Company settings updated successfully',
            data: {
                id: company._id,
                name: company.name,
                slug: company.slug,
                email: company.email,
                phone: company.phone,
                logo: company.logo,
                website: company.website,
                description: company.description,
                address: company.address,
                city: company.city,
                state: company.state,
                country: company.country,
                status: company.status,
                timezone: company.timezone,
                currency: company.currency,
                updatedAt: company.updatedAt,
            },
        });

    } catch (error) {
        // Lost a race on the unique email index.
        if (error.code === 11000) {
            return companyEmailTaken(res);
        }

        console.error('❌ Update settings error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to update company settings',
        });
    }
};

// ── UPDATE COMPANY LOGO ──
const updateCompanyLogo = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        const logoCheck = validateLogo((req.body || {}).logo);

        if (logoCheck.errors) {
            return sendValidationErrors(res, logoCheck.errors);
        }

        const logo = logoCheck.value;

        const company = await Company.findById(companyId);

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found',
            });
        }

        const oldLogo = company.logo;
        company.logo = logo;
        await company.save();

        // Audit log — the logo is already saved; an audit failure must not
        // turn that into a false 500 (same pattern as booking.controller.js).
        try {
            await AuditLog.create({
                userId: req.user.id,
                companyId: companyId,
                action: 'UPDATE_COMPANY_LOGO',
                entityType: 'COMPANY',
                entityId: company._id,
                metadata: { oldLogo, newLogo: logo },
            });
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError);
        }

        res.json({
            success: true,
            message: 'Company logo updated successfully',
            data: { logo: company.logo },
        });

    } catch (error) {
        console.error('❌ Update logo error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update company logo',
        });
    }
};

// ── GET COMPANY USAGE STATS ──
const getCompanyUsage = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        const [
            employeeCount,
            campaignCount,
            bookingCount,
            storageResult,
        ] = await Promise.all([
            Employee.countDocuments({
                companyId: companyId,
                isActive: true,
            }),

            Campaign.countDocuments({
                companyId: companyId,
            }),

            // Booking.companyId is required and set from the booking
            // company at creation (booking.controller.js).
            Booking.countDocuments({
                companyId: companyId,
            }),

            // Creatives have no companyId: scope through their campaign,
            // the same pipeline the company dashboard uses.
            Creative.aggregate([
                {
                    $lookup: {
                        from: 'campaigns',
                        localField: 'campaignId',
                        foreignField: '_id',
                        as: 'campaign',
                    },
                },
                { $unwind: '$campaign' },
                { $match: { 'campaign.companyId': companyId } },
                {
                    $group: {
                        _id: null,
                        totalBytes: { $sum: { $ifNull: ['$size', 0] } },
                    },
                },
            ]),
        ]);

        // Sum of the size recorded on this company's creatives (bytes).
        const storageUsedBytes = storageResult[0]?.totalBytes || 0;

        res.json({
            success: true,
            data: {
                employeeCount,
                campaignCount,
                bookingCount,
                storageUsed: `${Number((storageUsedBytes / (1024 * 1024)).toFixed(2))} MB`,
                storageUsedBytes,
                // No storage quota exists in Media Masters yet (no plan /
                // subscription / quota field or config anywhere). The old
                // hardcoded 5 GB was a placeholder, so report "no limit defined"
                // instead of presenting an invented quota.
                storageLimit: null,
            },
        });

    } catch (error) {
        console.error('❌ Get usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load company usage',
        });
    }
};

module.exports = {
    getCompanySettings,
    updateCompanySettings,
    updateCompanyLogo,
    getCompanyUsage,
};