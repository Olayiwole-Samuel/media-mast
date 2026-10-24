const mongoose = require('mongoose');

const User = require('../models/User');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { ensureCompanyOwnerEmployee } = require('./admin.controller');

// ─────────────────────────────────────────────────────────────
// COMPANY OWNER RECORD: check and repair (admin)
//
// A company owner (the COMPANY account) can only use owner features with an
// active "Company Owner" Employee record (requireCompanyOwner). These two
// endpoints let an admin see whether that record is right and, for the two
// safe cases, fix it through the app:
//   MISSING_OWNER_RECORD  → create it (ensureCompanyOwnerEmployee)
//   INACTIVE_OWNER_RECORD → reactivate it
// Every other problem is reported, never changed automatically.
// ─────────────────────────────────────────────────────────────

const REPAIRABLE = ['MISSING_OWNER_RECORD', 'INACTIVE_OWNER_RECORD'];

const DESCRIPTIONS = {
    OK: 'The company owner has an active owner record.',
    MISSING_OWNER_RECORD: 'The owner account exists but has no owner record, so owner features are blocked. It can be created.',
    INACTIVE_OWNER_RECORD: 'The owner record exists but is inactive, so owner features are blocked. It can be reactivated.',
    NO_OWNER_ACCOUNT: 'No company owner account is linked to this company. Create or link one first.',
    MULTIPLE_OWNER_ACCOUNTS: 'More than one company owner account is linked to this company. Resolve this manually.',
    OWNER_RECORD_CONFLICT: 'The owner account has a team record that does not match the owner role (another company or position). Resolve this manually.',
    OTHER_OWNER_RECORD: 'A different user is recorded as this company\'s owner. Resolve this manually.',
};

const diagnose = async (companyId, session = null) => {
    const owners = await User.find({ companyId, accountType: 'COMPANY' })
        .select('_id name email status')
        .session(session);

    if (owners.length === 0) return { status: 'NO_OWNER_ACCOUNT', owner: null, record: null };
    if (owners.length > 1) return { status: 'MULTIPLE_OWNER_ACCOUNTS', owner: null, record: null, ownerCount: owners.length };

    const owner = owners[0];
    const record = await Employee.findOne({ userId: owner._id }).session(session);
    const otherOwner = await Employee.findOne({ companyId, position: 'Company Owner', userId: { $ne: owner._id } })
        .select('_id')
        .session(session);

    if (record) {
        const sameRole = String(record.companyId) === String(companyId) && record.position === 'Company Owner';
        if (!sameRole) return { status: 'OWNER_RECORD_CONFLICT', owner, record };
        if (otherOwner) return { status: 'OTHER_OWNER_RECORD', owner, record };
        return { status: record.isActive === true ? 'OK' : 'INACTIVE_OWNER_RECORD', owner, record };
    }

    if (otherOwner) return { status: 'OTHER_OWNER_RECORD', owner, record: null };
    return { status: 'MISSING_OWNER_RECORD', owner, record: null };
};

const publicDiagnosis = (company, d) => ({
    companyId: company._id,
    companyName: company.name,
    companyStatus: company.status,
    status: d.status,
    repairable: REPAIRABLE.includes(d.status),
    description: DESCRIPTIONS[d.status],
    owner: d.owner ? { _id: d.owner._id, name: d.owner.name, email: d.owner.email, status: d.owner.status } : null,
    ownerRecord: d.record
        ? { _id: d.record._id, position: d.record.position, isActive: d.record.isActive, sameCompany: String(d.record.companyId) === String(company._id) }
        : null,
    ...(d.ownerCount ? { ownerCount: d.ownerCount } : {}),
});

const loadCompany = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid company ID' });
        return null;
    }
    const company = await Company.findById(req.params.id).select('_id name status');
    if (!company) {
        res.status(404).json({ success: false, message: 'Company not found' });
        return null;
    }
    return company;
};

// GET /admin/companies/:id/owner-check — read only.
const checkCompanyOwner = async (req, res) => {
    try {
        const company = await loadCompany(req, res);
        if (!company) return undefined;
        return res.json({ success: true, data: publicDiagnosis(company, await diagnose(company._id)) });
    } catch (error) {
        console.error('❌ Company owner check error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to check the company owner' });
    }
};

class RepairRefused extends Error {
    constructor(diagnosis) {
        super('repair refused');
        this.name = 'RepairRefused';
        this.diagnosis = diagnosis;
    }
}

// POST /admin/companies/:id/owner-repair — fixes only the safe cases, in a
// transaction that re-checks first (so it never acts on a stale check).
const repairCompanyOwner = async (req, res) => {
    let session = null;
    let outcome = null;
    let company = null;

    try {
        company = await loadCompany(req, res);
        if (!company) return undefined;

        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            outcome = null;
            const d = await diagnose(company._id, session);

            if (d.status === 'OK') {
                outcome = { result: 'NONE', before: d.status, diagnosis: d };
                return;
            }
            if (!REPAIRABLE.includes(d.status)) throw new RepairRefused(d);

            if (d.status === 'MISSING_OWNER_RECORD') {
                await ensureCompanyOwnerEmployee({ companyId: company._id, userId: d.owner._id, invitedBy: req.user.id, session });
                outcome = { result: 'CREATED_OWNER_RECORD', before: d.status };
            } else {
                await Employee.updateOne(
                    { _id: d.record._id, isActive: false },
                    { $set: { isActive: true } },
                    { session }
                );
                outcome = { result: 'REACTIVATED_OWNER_RECORD', before: d.status };
            }
            outcome.diagnosis = await diagnose(company._id, session);
        }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
        });

        if (outcome.result !== 'NONE') {
            try {
                await AuditLog.create({
                    userId: req.user.id,
                    companyId: company._id,
                    action: 'UPDATE_COMPANY',
                    entityType: 'COMPANY',
                    entityId: company._id,
                    metadata: { event: 'REPAIR_OWNER_RECORD', result: outcome.result, before: outcome.before, ownerUserId: String(outcome.diagnosis.owner?._id || '') },
                });
            } catch (auditError) {
                console.error('⚠️ Audit log error:', auditError.name, auditError.message);
            }
        }

        return res.json({
            success: true,
            message: outcome.result === 'NONE'
                ? 'Nothing to repair: the owner record is already correct.'
                : outcome.result === 'CREATED_OWNER_RECORD'
                    ? 'Owner record created. The company owner can use owner features again.'
                    : 'Owner record reactivated. The company owner can use owner features again.',
            data: { result: outcome.result, ...publicDiagnosis(company, outcome.diagnosis) },
        });
    } catch (error) {
        if (error instanceof RepairRefused) {
            return res.status(409).json({
                success: false,
                message: DESCRIPTIONS[error.diagnosis.status],
                data: publicDiagnosis(company, error.diagnosis),
            });
        }
        if (error.code === 'OWNER_EMPLOYEE_CONFLICT') {
            return res.status(409).json({ success: false, message: error.message });
        }
        console.error('❌ Company owner repair error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to repair the company owner record' });
    } finally {
        if (session) await session.endSession().catch(() => {});
    }
};

module.exports = {
    checkCompanyOwner,
    repairCompanyOwner,
};
