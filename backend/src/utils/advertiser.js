// ─────────────────────────────────────────────────
// ADVERTISER SCOPE
//
// Who owns a campaign / booking / payment, for routes guarded by
// requireAdvertiser (middleware/role.js):
//
//   COMPANY     every record of the company (companyId), as before.
//   INDIVIDUAL  only records the user owns that have no company.
//
// Never filter on req.user.companyId alone: for an individual it is null,
// and { companyId: null } matches every company-less record in MongoDB.
// ─────────────────────────────────────────────────

const advertiserScope = (req) => {
    const advertiser = req.advertiser;

    if (!advertiser) {
        // A route that forgot requireAdvertiser must fail closed.
        throw new Error('advertiserScope used without requireAdvertiser');
    }

    return advertiser.kind === 'INDIVIDUAL'
        ? { userId: advertiser.userId, companyId: null }
        : { companyId: advertiser.companyId };
};

// Owner fields for a new record: the acting user, and the company (or null).
const advertiserOwner = (req) => ({
    userId: req.user._id,
    companyId: req.advertiser ? req.advertiser.companyId : null,
});

// Populated refs (e.g. campaignId.companyId) compare by their _id.
const refId = (value) => (value && value._id ? value._id : value);

// Does an already-loaded record belong to this advertiser?
const ownsRecord = (req, record) => {
    if (!record) return false;
    const scope = advertiserScope(req);
    const companyId = refId(record.companyId);

    if (scope.companyId === null) {
        return companyId == null && String(refId(record.userId)) === String(scope.userId);
    }

    return companyId != null && String(companyId) === String(scope.companyId);
};

module.exports = {
    advertiserScope,
    advertiserOwner,
    ownsRecord,
};
